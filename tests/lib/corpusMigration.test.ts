import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();

function collection(name: string): FakeCollection {
  if (!collections.has(name)) collections.set(name, fakeCollection());
  return collections.get(name)!;
}

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => collection(name),
        command: vi.fn(async () => ({})),
      }),
    };
  },
}));

let taps = new Map<string, number>();
vi.mock("../../lib/suggestionDemand", () => ({
  suggestionDemand: vi.fn(async () => taps),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { MIGRATION_ID, migrateToCorpus } from "../../lib/corpusMigration";
import { MAX_CUTS } from "../../lib/songCorpus";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

const songs = () => collection("karaoke_songs");
const videos = () => collection("karaoke_videos");
const store = () => collection("suggestion_videos");
const state = () => collection("cron_state");

/** The order the migration pages in, so a cursor assertion can name a key. */
const catalogKeys = Array.from(suggestionCatalog().keys()).sort();

const RESOLVED_AT = new Date("2026-07-04T00:00:00Z");
const REFRESHED_AT = new Date("2026-08-01T00:00:00Z");

/** A legacy store entry: up to fifty rows from one search.list call, with the
 *  community's pick recorded separately rather than moved to the front. */
function seedStoreDoc(
  key: string,
  prefix: string,
  count: number,
  topVideoId?: string
): void {
  store().seed({
    _id: key,
    results: Array.from({ length: count }, (_, i) => ({
      videoId: `${prefix}-${i}`,
      title: `Cut ${i} of ${prefix}`,
      thumbnailUrl: `thumb-${prefix}-${i}`,
      durationSeconds: 200 + i,
      viewCount: 5000 - i,
    })),
    ...(topVideoId ? { topVideoId } : {}),
    resolvedAt: RESOLVED_AT,
    refreshedAt: REFRESHED_AT,
  });
}

const WIDE_KEY = catalogKeys[0];
const NARROW_KEY = catalogKeys[1];
const ADDED_KEY = catalogKeys[2];
const ORPHAN_KEY = "a song that left the catalog";

/** The common fixture: one entry deep enough to hit the cap with its pick near
 *  the bottom, one thin entry, and one key the catalog no longer knows. */
function seedLegacyStore(): void {
  seedStoreDoc(WIDE_KEY, "wide", 15, "wide-13");
  seedStoreDoc(NARROW_KEY, "narrow", 3);
  seedStoreDoc(ORPHAN_KEY, "orphan", 4);
}

const FAR_FUTURE = () => Date.now() + 60_000;

/** Advances the clock one step per reading, so a deadline picks how many
 *  batches a run gets — the module checks it once per batch. */
function tickingClock(stepMs: number): number {
  const base = Date.now();
  let ticks = 0;
  vi.spyOn(Date, "now").mockImplementation(() => base + stepMs * ticks++);
  return base;
}

/** Byte-for-byte comparable across runs: every timestamp the seed writes is
 *  copied from the store entry, never taken from the clock. */
function corpus(): string {
  return JSON.stringify([songs().all(), videos().all()]);
}

beforeEach(() => {
  collections.clear();
  taps = new Map();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("migrateToCorpus - full run", () => {
  beforeEach(() => {
    seedLegacyStore();
    taps.set(NARROW_KEY, 42);
  });

  it("gives every catalog song a doc and reports where it finished", async () => {
    const { done, report } = await migrateToCorpus(FAR_FUTURE());

    expect(done).toBe(true);
    expect(report.phase).toBe("done");
    expect(report.songsSeeded).toBe(suggestionCatalog().size);
    expect(songs().all().length).toBe(suggestionCatalog().size);
    // A song with nothing resolved is the wanted list, not a missing row.
    expect(songs().get(catalogKeys[3])).toMatchObject({ cuts: [], demand: 0 });
  });

  it("carries the store's pick to the front and caps what follows", async () => {
    await migrateToCorpus(FAR_FUTURE());

    const song = songs().get(WIDE_KEY);
    expect(song.cuts.length).toBe(MAX_CUTS);
    // Thirteenth in the stored order, first once pinned — the cap would have
    // dropped it where it sat.
    expect(song.cuts[0]).toBe("wide-13");
    expect(song.topVideoId).toBe("wide-13");
    expect(song.cuts.slice(1)).toEqual(
      Array.from({ length: MAX_CUTS - 1 }, (_, i) => `wide-${i}`)
    );
  });

  it("stores the rows that became cuts and no others", async () => {
    const { report } = await migrateToCorpus(FAR_FUTURE());

    expect(report.videosSeeded).toBe(MAX_CUTS + 3);
    expect(videos().get("wide-13")).toMatchObject({
      title: "Cut 13 of wide",
      thumbnailUrl: "thumb-wide-13",
      durationSeconds: 213,
      viewCount: 4987,
      songKeys: [WIDE_KEY],
      sources: { seed: true },
    });
    expect(videos().get("wide-11")).toBeNull();
    expect(videos().get("wide-14")).toBeNull();
  });

  it("keeps the store's retention clock rather than restarting it", async () => {
    await migrateToCorpus(FAR_FUTURE());

    expect(videos().get("narrow-0")).toMatchObject({
      refreshedAt: REFRESHED_AT,
      firstSeenAt: RESOLVED_AT,
    });
  });

  it("writes the tap counts onto the songs", async () => {
    const { report } = await migrateToCorpus(FAR_FUTURE());

    expect(report.demandScored).toBe(1);
    expect(songs().get(NARROW_KEY).demand).toBe(42);
    expect(songs().get(WIDE_KEY).demand).toBe(0);
  });

  it("counts a store entry whose song left the catalog instead of migrating it", async () => {
    const { report } = await migrateToCorpus(FAR_FUTURE());

    expect(report.orphaned).toBe(1);
    expect(songs().get(ORPHAN_KEY)).toBeNull();
    expect(videos().get("orphan-0")).toBeNull();
  });

  it("leaves the legacy store untouched", async () => {
    const before = JSON.stringify(store().all());

    await migrateToCorpus(FAR_FUTURE());

    expect(JSON.stringify(store().all())).toBe(before);
  });

  it("latches done without a cursor the TTL could delete", async () => {
    await migrateToCorpus(FAR_FUTURE());

    expect(state().get(MIGRATION_ID)).toEqual({
      _id: MIGRATION_ID,
      done: true,
      updatedAt: expect.anything(),
    });
  });
});

describe("migrateToCorpus - idempotence", () => {
  beforeEach(() => {
    seedLegacyStore();
    taps.set(NARROW_KEY, 42);
  });

  it("writes nothing at all on a second run", async () => {
    await migrateToCorpus(FAR_FUTURE());
    const writes = [songs(), videos(), state(), store()].flatMap((c) => [
      vi.spyOn(c, "updateOne"),
      vi.spyOn(c, "bulkWrite"),
    ]);

    const { done, report } = await migrateToCorpus(FAR_FUTURE());

    expect(done).toBe(true);
    expect(report.skipped).toBe(true);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it("leaves the same corpus when the run is repeated from the top", async () => {
    await migrateToCorpus(FAR_FUTURE());
    const seeded = corpus();

    state().clear();
    await migrateToCorpus(FAR_FUTURE());

    expect(corpus()).toBe(seeded);
  });
});

describe("migrateToCorpus - resumability", () => {
  beforeEach(() => {
    seedLegacyStore();
    taps.set(NARROW_KEY, 42);
  });

  it("stops on the deadline with the cursor on the last batch it finished", async () => {
    const base = tickingClock(1000);

    const { done, report } = await migrateToCorpus(base + 2500);

    expect(done).toBe(false);
    expect(report.phase).toBe("catalog");
    // Three readings fell inside the deadline, so three pages of 100 ran.
    expect(report.songsSeeded).toBe(300);
    expect(state().get(MIGRATION_ID).cursor).toBe(`catalog:${catalogKeys[299]}`);
    expect(state().get(MIGRATION_ID).done).toBeUndefined();
  });

  it("resumes where it stopped without re-seeding or duplicating a cut", async () => {
    const base = tickingClock(1000);
    await migrateToCorpus(base + 2500);
    vi.restoreAllMocks();

    const { done, report } = await migrateToCorpus(FAR_FUTURE());

    expect(done).toBe(true);
    expect(report.songsSeeded).toBe(suggestionCatalog().size - 300);
    expect(songs().all().length).toBe(suggestionCatalog().size);
    const cuts = songs().get(WIDE_KEY).cuts;
    expect(cuts.length).toBe(new Set(cuts).size);
    expect(cuts.length).toBe(MAX_CUTS);
  });

  it("does no work and forfeits nothing when the deadline has already passed", async () => {
    const { done, report } = await migrateToCorpus(Date.now() - 1);

    expect(done).toBe(false);
    expect(report.songsSeeded).toBe(0);
    expect(songs().all()).toEqual([]);
    expect(state().get(MIGRATION_ID).cursor).toBe("catalog:");
  });
});

describe("migrateToCorpus - a cut two songs share", () => {
  it("files the video under both rather than the last one written", async () => {
    const shared = { videoId: "shared", title: "A duet", thumbnailUrl: "thumb" };
    for (const key of [WIDE_KEY, NARROW_KEY]) {
      store().seed({
        _id: key,
        results: [shared],
        resolvedAt: RESOLVED_AT,
        refreshedAt: REFRESHED_AT,
      });
    }

    const { report } = await migrateToCorpus(FAR_FUTURE());

    expect(report.videosSeeded).toBe(1);
    expect(report.songsFilled).toBe(2);
    expect(videos().get("shared").songKeys).toEqual([WIDE_KEY, NARROW_KEY]);
    expect(songs().get(WIDE_KEY).cuts).toEqual(["shared"]);
    expect(songs().get(NARROW_KEY).cuts).toEqual(["shared"]);
  });
});

describe("migrateToCorpus - songs adds reached first", () => {
  it("keeps the add-derived counts, ranking and pick", async () => {
    seedStoreDoc(ADDED_KEY, "seed", 15, "seed-13");
    songs().seed({
      _id: ADDED_KEY,
      title: "Whatever the add called it",
      artist: "Whoever the add called it",
      cuts: ["added"],
      topVideoId: "added",
      addCount: 3,
      addsByCountry: { BR: 3 },
      demand: 0,
    });

    await migrateToCorpus(FAR_FUTURE());

    const song = songs().get(ADDED_KEY);
    expect(song).toMatchObject({
      title: "Whatever the add called it",
      addCount: 3,
      addsByCountry: { BR: 3 },
      // Two rooms chose this one; a store-wide pick doesn't outrank that.
      topVideoId: "added",
    });
    // The seed fills the rest of the cap behind what singers actually queued.
    expect(song.cuts[0]).toBe("added");
    expect(song.cuts.length).toBe(MAX_CUTS);
    expect(song.cuts[1]).toBe("seed-13");
  });
});
