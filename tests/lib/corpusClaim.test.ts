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

import { claimBankedVideos } from "../../lib/corpusClaim";
import { songIdentityFromCatalog } from "../../lib/songCorpus";
import { suggestionCatalog, type CatalogEntry } from "../../lib/suggestionCatalog";
import { isCutOf } from "../../lib/suggestionMatch";

const videos = () => collection("karaoke_videos");
const songs = () => collection("karaoke_songs");

function cutTitle(e: CatalogEntry): string {
  return `${e.artist} - ${e.title} (Karaoke Version)`;
}

const catalog = Array.from(suggestionCatalog().values());
const entry: CatalogEntry = catalog.find((e) => isCutOf(cutTitle(e), e))!;

const FIRST_SEEN = new Date("2026-08-01T00:00:00Z");

/** A row banked by an add or a search: real title, no song claims it. */
function banked(videoId: string, over: Record<string, unknown> = {}) {
  videos().seed({
    _id: videoId,
    title: cutTitle(entry),
    thumbnailUrl: `thumb-${videoId}`,
    durationSeconds: 231,
    viewCount: 4200,
    sources: { search: { at: FIRST_SEEN, count: 3, byCountry: { PH: 3 } } },
    firstSeenAt: FIRST_SEEN,
    refreshedAt: FIRST_SEEN,
    ...over,
  });
}

function wanted(over: Record<string, unknown> = {}) {
  songs().seed({
    ...songIdentityFromCatalog(entry),
    cuts: [],
    demand: 0,
    ...over,
  });
}

const soon = () => Date.now() + 30_000;

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

describe("claimBankedVideos", () => {
  it("fills a wanted song from a row we already hold", async () => {
    wanted();
    banked("v1");

    const { report } = await claimBankedVideos(soon());

    expect(report).toMatchObject({ wanted: 1, scanned: 1, songsFilled: 1 });
    expect(songs().get(entry.key).cuts).toEqual(["v1"]);
    expect(videos().get("v1").songKeys).toEqual([entry.key]);
  });

  it("marks the row as claimed rather than inventing a channel that swept it", async () => {
    wanted();
    banked("v1");

    await claimBankedVideos(soon());

    const row = videos().get("v1");
    expect(row.sources.claim.matchedAt).toBeInstanceOf(Date);
    expect(row.sources.harvest).toBeUndefined();
    // The search that banked it is still on the row: a claim adds provenance.
    expect(row.sources.search).toMatchObject({ count: 3 });
  });

  it("leaves the row's own retention clock alone", async () => {
    wanted();
    banked("v1");

    await claimBankedVideos(soon());

    // Nothing was fetched, so nothing may renew the 30-day window.
    expect(videos().get("v1").refreshedAt).toEqual(FIRST_SEEN);
  });

  it("keeps the duration and view count the paid call bought", async () => {
    wanted();
    banked("v1");

    await claimBankedVideos(soon());

    expect(videos().get("v1")).toMatchObject({
      durationSeconds: 231,
      viewCount: 4200,
    });
  });

  it("refuses a row whose title does not name the song", async () => {
    wanted();
    banked("v1", { title: "Someone Else - A Different Song (Karaoke)" });

    const { report } = await claimBankedVideos(soon());

    expect(report.songsFilled).toBe(0);
    expect(songs().get(entry.key).cuts).toEqual([]);
  });

  it("refuses a row the sweep tombstoned, since nothing here re-reads it", async () => {
    wanted();
    banked("v1");
    collection("blocked_videos").seed({
      _id: "v1",
      reason: "unembeddable",
      blockedAt: new Date(),
    });

    const { report } = await claimBankedVideos(soon());

    // Read and rejected, not skipped: the cap is about the scan, not the match.
    expect(report).toMatchObject({ scanned: 1, matched: 0, songsFilled: 0 });
    expect(songs().get(entry.key).cuts).toEqual([]);
  });

  it("leaves a row another song already claims alone", async () => {
    wanted();
    banked("v1", { songKeys: ["some other song"] });

    const { report } = await claimBankedVideos(soon());

    expect(report.scanned).toBe(0);
    expect(songs().get(entry.key).cuts).toEqual([]);
  });

  it("does nothing when every song already has cuts", async () => {
    wanted({ cuts: ["already"] });
    banked("v1");

    const { report, done } = await claimBankedVideos(soon());

    expect(report).toMatchObject({ wanted: 0, songsFilled: 0 });
    expect(done).toBe(true);
  });

  it("stops before the deadline rather than overrunning the function", async () => {
    wanted();
    banked("v1");

    const { done, report } = await claimBankedVideos(Date.now() - 1);

    expect(done).toBe(false);
    expect(report.scanned).toBe(0);
  });

  it("spends a capped scan on the newest evidence, not the oldest rows", async () => {
    // The filter is a collection scan, so unsorted a short read takes the oldest
    // rows — the ones nothing has ever matched.
    wanted();
    banked("old", { refreshedAt: new Date("2026-07-01T00:00:00Z") });
    banked("new", { refreshedAt: new Date("2026-08-20T00:00:00Z") });

    const { report } = await claimBankedVideos(soon(), 1);

    expect(report.scanned).toBe(1);
    expect(songs().get(entry.key).cuts).toEqual(["new"]);
  });

  it("says it is unfinished when the scan hit its cap", async () => {
    wanted();
    banked("v1");
    banked("v2", { title: "Nothing - Matches This (Karaoke)" });

    const { done } = await claimBankedVideos(soon(), 2);

    expect(done).toBe(false);
  });
});
