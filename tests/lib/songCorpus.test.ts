import { describe, it, expect, vi, beforeEach } from "vitest";
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

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import type { SearchResult } from "../../lib/searchCache";
import {
  MAX_CUTS,
  MIN_ADD_ROOMS,
  recordAdd,
  recordDemand,
  recordHarvestMatches,
  recordSearchResults,
  songIdentityFromCatalog,
  type AddSource,
  type AddedVideo,
} from "../../lib/songCorpus";
import {
  catalogPackIds,
  suggestionCatalog,
  type CatalogEntry,
} from "../../lib/suggestionCatalog";
import { isCutOf, type MatchedVideo } from "../../lib/suggestionMatch";

const videos = () => collection("karaoke_videos");
const songs = () => collection("karaoke_songs");

/** A real channel title: the add path only groups a video whose title names the
 *  song, so a placeholder fixture would never be stored as a cut. */
function cutTitle(e: CatalogEntry): string {
  return `${e.artist} - ${e.title} (Karaoke Version)`;
}

const catalog = Array.from(suggestionCatalog().values());
const entry: CatalogEntry = catalog.find((e) => isCutOf(cutTitle(e), e))!;
const otherEntry: CatalogEntry = catalog.find((e) => e.key !== entry.key)!;

const nativeEntry: CatalogEntry =
  catalog.find((e) => e.nativeTitle) ?? entry;

async function add(video: AddedVideo, opts: AddSource): Promise<void> {
  await recordAdd(video, opts);
}

async function addCut(
  videoId: string,
  opts: { roomId?: string; country?: string } = {}
): Promise<void> {
  await add(
    { videoId, title: cutTitle(entry) },
    {
      via: "search",
      suggestionKey: entry.key,
      roomId: opts.roomId ?? "ROOM1",
      country: opts.country ?? "BR",
    }
  );
}

/** What it takes to badge a cut: one room's adds are a claim, not a consensus. */
async function badgeCut(videoId: string): Promise<void> {
  for (let i = 0; i < MIN_ADD_ROOMS; i++) {
    await addCut(videoId, { roomId: `ROOM${i}` });
  }
}

function matched(videoId: string, channel = "sing-king"): MatchedVideo {
  return {
    videoId,
    title: `Harvested ${videoId}`,
    thumbnailUrl: `thumb-${videoId}`,
    channel,
    extra: 0,
  };
}

function enriched(videoId: string): SearchResult {
  return {
    videoId,
    title: `Enriched ${videoId}`,
    thumbnailUrl: `better-${videoId}`,
    durationSeconds: 210,
    viewCount: 1234,
  };
}

/** Timestamps are allowed to move on a re-run; nothing else is. */
function stateWithoutTimestamps(): string {
  return JSON.stringify([videos().all(), songs().all()]).replace(
    /"\d{4}-\d{2}-\d{2}T[^"]*"/g,
    '"<when>"'
  );
}

beforeEach(() => {
  collections.clear();
  vi.clearAllMocks();
});

describe("recordAdd", () => {
  it("stores an unknown video and the song it was tapped from", async () => {
    await addCut("abc123");

    expect(videos().get("abc123")).toMatchObject({
      _id: "abc123",
      title: cutTitle(entry),
      songKeys: [entry.key],
      sources: { adds: { count: 1, byCountry: { BR: 1 }, rooms: ["ROOM1"] } },
    });
    expect(songs().get(entry.key)).toMatchObject({
      _id: entry.key,
      title: entry.title,
      artist: entry.artist,
      cuts: ["abc123"],
      addCount: 1,
      addsByCountry: { BR: 1 },
      demand: 0,
    });
  });

  it("counts a repeat add once each without duplicating the cut", async () => {
    await addCut("abc123");
    await addCut("abc123");

    expect(videos().get("abc123").sources.adds.count).toBe(2);
    expect(videos().get("abc123").sources.adds.byCountry).toEqual({ BR: 2 });
    expect(songs().get(entry.key).addCount).toBe(2);
    expect(songs().get(entry.key).cuts).toEqual(["abc123"]);
  });

  it("never lets a later add rewrite what the corpus serves", async () => {
    await addCut("abc123");

    await add(
      { videoId: "abc123", title: "Anything The Request Body Says" },
      { via: "search", suggestionKey: entry.key, roomId: "ROOM9" }
    );

    const doc = videos().get("abc123");
    expect(doc.title).toBe(cutTitle(entry));
    expect(doc.thumbnailUrl).toBe("");
    expect(doc.sources.adds.count).toBe(2);
  });

  it("leaves the retention clock to the sweep once the row exists", async () => {
    await addCut("abc123");
    const born = videos().get("abc123").refreshedAt;

    await addCut("abc123", { roomId: "ROOM2" });

    expect(videos().get("abc123").refreshedAt).toBe(born);
  });

  it("keeps a video whose title doesn't name the tapped song ungrouped", async () => {
    await add(
      { videoId: "wrong", title: "Somebody Else Entirely (Karaoke Version)" },
      { via: "search", suggestionKey: entry.key, roomId: "ROOM1" }
    );

    expect(videos().get("wrong").songKeys).toBeUndefined();
    expect(songs().all()).toEqual([]);
  });

  it("keeps a video with no suggestion ungrouped", async () => {
    await add({ videoId: "loose", title: "Something a singer searched" }, {
      via: "search",
      roomId: "ROOM1",
    });

    expect(videos().get("loose")).toMatchObject({ sources: { adds: { count: 1 } } });
    expect(videos().get("loose").songKeys).toBeUndefined();
    expect(songs().all()).toEqual([]);
  });

  it("keeps a pasted link ungrouped even when it carries a key", async () => {
    await add({ videoId: "pasted", title: cutTitle(entry) }, {
      via: "paste",
      suggestionKey: entry.key,
      roomId: "ROOM1",
    });

    expect(videos().get("pasted").songKeys).toBeUndefined();
    expect(songs().all()).toEqual([]);
  });

  it("leaves the row picture-less, which is what keeps it off the browse path", async () => {
    await addCut("abc123");

    const doc = videos().get("abc123");
    expect(doc.thumbnailUrl).toBe("");
    expect(doc.firstSeenAt).toBeTruthy();
    expect(doc.refreshedAt).toBeTruthy();
  });

  it("drops a country that isn't a country code", async () => {
    await add({ videoId: "abc123", title: cutTitle(entry) }, {
      via: "search",
      suggestionKey: entry.key,
      roomId: "ROOM1",
      country: "not.a.country",
    });

    expect(videos().get("abc123").sources.adds.byCountry).toEqual({});
    expect(songs().get(entry.key).addsByCountry).toEqual({});
  });

  it("waits for a second room before badging a cut", async () => {
    await addCut("one");
    await addCut("one");
    await addCut("one");

    expect(songs().get(entry.key).topVideoId).toBeUndefined();

    await addCut("one", { roomId: "ROOM2" });
    expect(songs().get(entry.key).topVideoId).toBe("one");
  });

  it("ranks the cut two rooms chose over the one a room ran up", async () => {
    await addCut("run-up");
    await addCut("run-up");
    await addCut("run-up");
    await badgeCut("agreed");

    const song = songs().get(entry.key);
    expect(song.cuts).toEqual(["agreed", "run-up"]);
    expect(song.topVideoId).toBe("agreed");
  });

  it("points topVideoId at the most-added cut, in the cuts it ranks", async () => {
    await badgeCut("one");
    await badgeCut("two");
    await addCut("two");

    const song = songs().get(entry.key);
    expect(song.topVideoId).toBe("two");
    expect(song.cuts).toEqual(["two", "one"]);
    expect(song.cuts).toContain(song.topVideoId);
  });

  it("drops a cut whose video row is gone", async () => {
    songs().seed({
      _id: entry.key,
      cuts: ["expired"],
      addCount: 1,
      addsByCountry: {},
      demand: 0,
    });

    await addCut("fresh");

    expect(songs().get(entry.key).cuts).toEqual(["fresh"]);
  });

  it("clears a badge whose cut has left the list", async () => {
    songs().seed({
      _id: entry.key,
      cuts: ["expired"],
      topVideoId: "expired",
      addCount: 1,
      addsByCountry: {},
      demand: 0,
    });

    await addCut("fresh");

    expect(songs().get(entry.key).topVideoId).toBeUndefined();
  });

  it("drops the lowest-ranked cut at the cap, never the badged one", async () => {
    await badgeCut("v0");
    await addCut("v0");
    for (let i = 1; i <= 11; i++) await addCut(`v${i}`);
    expect(songs().get(entry.key).cuts).toHaveLength(MAX_CUTS);

    await addCut("v12");
    expect(songs().get(entry.key).cuts).not.toContain("v12");

    await addCut("v12");
    const song = songs().get(entry.key);
    expect(song.cuts).toHaveLength(MAX_CUTS);
    expect(song.cuts.slice(0, 2)).toEqual(["v0", "v12"]);
    expect(song.cuts).not.toContain("v11");
    expect(song.topVideoId).toBe("v0");
    expect(song.cuts).toContain("v0");
  });

  it("swallows a store failure instead of surfacing it", async () => {
    const store = videos();
    store.updateOne = async () => {
      throw new Error("mongo down");
    };

    await expect(
      recordAdd({ videoId: "abc123", title: cutTitle(entry) }, {
        via: "search",
        suggestionKey: entry.key,
        roomId: "ROOM1",
      })
    ).resolves.toBeUndefined();

    expect(songs().all()).toEqual([]);
  });
});

describe("recordHarvestMatches", () => {
  it("stores matched videos and fills the song's cuts", async () => {
    const report = await recordHarvestMatches(
      new Map([[entry.key, [matched("h1"), matched("h2")]]]),
      new Map([["h1", enriched("h1")]])
    );

    expect(report).toEqual({
      videosUpserted: 2,
      videosRefreshed: 0,
      songsFilled: 1,
      full: [],
    });
    expect(videos().get("h1")).toMatchObject({
      title: "Enriched h1",
      thumbnailUrl: "better-h1",
      durationSeconds: 210,
      viewCount: 1234,
      songKeys: [entry.key],
      sources: { harvest: { channel: "sing-king" } },
    });
    expect(videos().get("h2")).toMatchObject({
      title: "Harvested h2",
      thumbnailUrl: "thumb-h2",
    });
    expect(songs().get(entry.key)).toMatchObject({
      title: entry.title,
      cuts: ["h1", "h2"],
      addCount: 0,
      demand: 0,
    });
    expect(songs().get(entry.key).topVideoId).toBeUndefined();
  });

  it("files one upload under every song it matches", async () => {
    await recordHarvestMatches(
      new Map([
        [entry.key, [matched("h1")]],
        [otherEntry.key, [matched("h1")]],
      ]),
      new Map()
    );

    expect(videos().get("h1").songKeys.slice().sort()).toEqual(
      [entry.key, otherEntry.key].sort()
    );
    expect(songs().get(entry.key).cuts).toEqual(["h1"]);
    expect(songs().get(otherEntry.key).cuts).toEqual(["h1"]);
  });

  it("changes nothing but timestamps when it runs again", async () => {
    const matches = new Map([[entry.key, [matched("h1"), matched("h2")]]]);
    const details = new Map([["h1", enriched("h1")]]);

    await recordHarvestMatches(matches, details);
    const first = stateWithoutTimestamps();
    const report = await recordHarvestMatches(matches, details);

    expect(stateWithoutTimestamps()).toBe(first);
    expect(report).toEqual({
      videosUpserted: 0,
      videosRefreshed: 2,
      songsFilled: 0,
      full: [],
    });
  });

  it("appends behind the cuts singers have already chosen", async () => {
    await badgeCut("chosen");

    await recordHarvestMatches(
      new Map([[entry.key, [matched("h1")]]]),
      new Map()
    );

    const song = songs().get(entry.key);
    expect(song.cuts).toEqual(["chosen", "h1"]);
    expect(song.topVideoId).toBe("chosen");
  });

  it("stops filling at the cap", async () => {
    const rows = Array.from({ length: MAX_CUTS + 3 }, (_, i) => matched(`h${i}`));

    await recordHarvestMatches(new Map([[entry.key, rows]]), new Map());

    expect(songs().get(entry.key).cuts).toHaveLength(MAX_CUTS);
  });

  it("ignores a match against a song the catalog can't name", async () => {
    const report = await recordHarvestMatches(
      new Map([["not a catalog key", [matched("h1")]]]),
      new Map()
    );

    expect(videos().get("h1")).toBeTruthy();
    expect(songs().all()).toEqual([]);
    expect(report.songsFilled).toBe(0);
  });

  it("drops a cut whose video row has expired", async () => {
    songs().seed({
      _id: entry.key,
      title: entry.title,
      artist: entry.artist,
      cuts: ["expired"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });

    await recordHarvestMatches(
      new Map([[entry.key, [matched("h1")]]]),
      new Map()
    );

    expect(songs().get(entry.key).cuts).toEqual(["h1"]);
  });

  it("carries a catalog correction to a song nobody has added", async () => {
    songs().seed({
      _id: entry.key,
      title: "Mis-spelled",
      artist: "Wrong",
      cuts: ["h1"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });

    await recordHarvestMatches(
      new Map([[entry.key, [matched("h1")]]]),
      new Map()
    );

    expect(songs().get(entry.key)).toMatchObject({
      title: entry.title,
      artist: entry.artist,
    });
  });
});

describe("recordSearchResults", () => {
  function result(videoId: string): SearchResult {
    return {
      videoId,
      title: `Result ${videoId}`,
      thumbnailUrl: `thumb-${videoId}`,
      durationSeconds: 210,
      viewCount: 5000,
    };
  }

  it("can name a song but never create one", async () => {
    const written = await recordSearchResults("no song has this key", [result("a")]);

    expect(written).toEqual({ videosUpserted: 0, cutsAdded: 0 });
    // Were this an upsert, any query anyone typed would file itself as a song.
    expect(songs().all()).toEqual([]);
    expect(videos().all()).toEqual([]);
  });

  it("fills a wanted song's cuts and banks the rows behind them", async () => {
    songs().seed({ ...songIdentityFromCatalog(entry), cuts: [], demand: 3 });

    const written = await recordSearchResults(entry.key, [result("a"), result("b")]);

    expect(written.cutsAdded).toBe(2);
    expect(songs().get(entry.key)).toMatchObject({ cuts: ["a", "b"] });
    expect(videos().get("a")).toMatchObject({
      title: "Result a",
      songKeys: [entry.key],
      durationSeconds: 210,
      viewCount: 5000,
    });
    expect(videos().get("a")?.sources?.search?.at).toBeInstanceOf(Date);
  });

  it("appends behind the cuts singers have already chosen", async () => {
    await addCut("chosen");

    await recordSearchResults(entry.key, [result("a")]);

    expect(songs().get(entry.key)?.cuts).toEqual(["chosen", "a"]);
  });

  it("stops filling at the cap", async () => {
    songs().seed({ ...songIdentityFromCatalog(entry), cuts: [], demand: 0 });
    const rows = Array.from({ length: MAX_CUTS + 5 }, (_, i) => result(`v${i}`));

    await recordSearchResults(entry.key, rows);

    expect(songs().get(entry.key)?.cuts).toHaveLength(MAX_CUTS);
    expect(videos().all()).toHaveLength(MAX_CUTS);
  });

  it("clears the backoff a run of empty answers earned", async () => {
    songs().seed({
      ...songIdentityFromCatalog(entry),
      cuts: [],
      demand: 0,
      resolveMisses: 3,
      nextResolveAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    await recordSearchResults(entry.key, [result("a")]);

    const song = songs().get(entry.key)!;
    expect(song.resolveMisses).toBeUndefined();
    expect(song.nextResolveAt).toBeUndefined();
  });

  it("keeps a cut a room added while the run was reading", async () => {
    const store = songs();
    const readSongs = store.find;
    store.find = (filter: any, options?: any) => {
      store.find = readSongs;
      const cursor = readSongs.call(store, filter, options);
      const readRows = cursor.toArray;
      cursor.toArray = async () => {
        const rows = await readRows.call(cursor);
        await addCut("chosen");
        return rows;
      };
      return cursor;
    };

    await recordHarvestMatches(new Map([[entry.key, [matched("h1")]]]), new Map());

    expect(songs().get(entry.key).cuts).toEqual(["chosen", "h1"]);
  });

  it("files a cut once when a room adds the very one it is filing", async () => {
    const store = songs();
    const readSongs = store.find;
    store.find = (filter: any, options?: any) => {
      store.find = readSongs;
      const cursor = readSongs.call(store, filter, options);
      const readRows = cursor.toArray;
      cursor.toArray = async () => {
        const rows = await readRows.call(cursor);
        await addCut("h1");
        return rows;
      };
      return cursor;
    };

    await recordHarvestMatches(new Map([[entry.key, [matched("h1")]]]), new Map());

    expect(songs().get(entry.key).cuts).toEqual(["h1"]);
  });

  it("drops a cut whose video row has expired", async () => {
    songs().seed({ ...songIdentityFromCatalog(entry), cuts: ["gone"], demand: 0 });

    await recordSearchResults(entry.key, [result("a")]);

    expect(songs().get(entry.key)?.cuts).toEqual(["a"]);
  });

  it("writes nothing for an empty result set", async () => {
    songs().seed({ ...songIdentityFromCatalog(entry), cuts: [], demand: 0 });

    expect(await recordSearchResults(entry.key, [])).toEqual({
      videosUpserted: 0,
      cutsAdded: 0,
    });
  });
});

// A row only an add has written has no picture, so readSongCuts won't serve it —
// and a capped slot it holds costs the song a cut every tap can play.
describe("cuts nothing has named yet", () => {
  async function fillWithHarvested(count: number): Promise<string[]> {
    const ids = Array.from({ length: count }, (_, i) => `h${i}`);
    await recordHarvestMatches(
      new Map([[entry.key, ids.map((id) => matched(id))]]),
      new Map()
    );
    return ids;
  }

  it("never takes the place of a cut a room can play", async () => {
    const harvested = await fillWithHarvested(MAX_CUTS);

    await addCut("unnamed");

    const cuts: string[] = songs().get(entry.key).cuts;
    expect(cuts[0]).toBe("unnamed");
    for (const id of harvested) expect(cuts).toContain(id);
  });

  it("leaves room for the search a song's cuts were bought with", async () => {
    for (let i = 0; i < MAX_CUTS; i++) {
      await addCut(`unnamed${i}`, { roomId: `ROOM${i}` });
    }

    const written = await recordSearchResults(entry.key, [result("bought")]);

    // Counted against the cap, unproven adds turn every later search into a call
    // that buys nothing.
    expect(written.cutsAdded).toBe(1);
    expect(songs().get(entry.key).cuts).toContain("bought");
  });

  function result(videoId: string): SearchResult {
    return {
      videoId,
      title: `Result ${videoId}`,
      thumbnailUrl: `thumb-${videoId}`,
    };
  }

  it("stops the harvest filling a song that is already full", async () => {
    const report = await recordHarvestMatches(
      new Map([[entry.key, Array.from({ length: MAX_CUTS }, (_, i) => matched(`f${i}`))]]),
      new Map()
    );

    expect(report.full).toEqual([entry.key]);
  });
});

describe("recordDemand", () => {
  it("rewrites the order the resolver spends its searches in", async () => {
    songs().seed({ ...songIdentityFromCatalog(entry), cuts: [], demand: 0 });

    await recordDemand(new Map([[entry.key, 42]]));

    expect(songs().get(entry.key).demand).toBe(42);
  });

  it("creates no song: the catalog is what bounds the corpus", async () => {
    await recordDemand(new Map([["a song nobody curated", 9]]));

    expect(songs().all()).toEqual([]);
  });
});

describe("songIdentityFromCatalog", () => {
  it("keys the song on the key a tap resolves to", () => {
    expect(songIdentityFromCatalog(entry)).toEqual({
      _id: entry.key,
      title: entry.title,
      artist: entry.artist,
      packIds: catalogPackIds(entry.key),
    });
  });

  it("names every pack curating the song, not just the last one loaded", () => {
    const packs = songIdentityFromCatalog(entry).packIds ?? [];

    expect(packs).toContain(entry.packId);
    expect(new Set(packs).size).toBe(packs.length);
  });

  it("carries the native names a channel titles its uploads in", () => {
    const identity = songIdentityFromCatalog(nativeEntry);

    expect(identity.nativeTitle).toBe(nativeEntry.nativeTitle);
    expect(identity.nativeArtist).toBe(nativeEntry.nativeArtist);
  });
});
