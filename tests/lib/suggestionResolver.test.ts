import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// One fake collection per name, so a test can assert what landed in
// suggestion_videos without the analytics pipeline writing over it.
const collections = new Map<string, ReturnType<typeof fakeCollection>>();

function fakeCollection() {
  return {
    find: vi.fn(() => ({
      limit: vi.fn(function (this: unknown) {
        return this;
      }),
      toArray: vi.fn(async () => [] as any[]),
    })),
    findOne: vi.fn(async () => null as any),
    updateOne: vi.fn(async () => ({ matchedCount: 1 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    aggregate: vi.fn(() => ({ toArray: vi.fn(async () => [] as any[]) })),
    createIndex: vi.fn(async () => "ok"),
    command: vi.fn(async () => ({})),
  };
}

function collection(name: string) {
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

const harvestMock = vi.fn(async (..._args: unknown[]) => ({
  channels: [],
  missing: [],
  units: 0,
  pages: 0,
  stoppedEarly: false,
}));
vi.mock("../../lib/karaokeChannels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/karaokeChannels")>()),
  harvestKaraokeChannels: (...args: unknown[]) => harvestMock(...args),
}));

const searchYoutubeMock = vi.fn(async (..._args: unknown[]) => [] as any[]);
vi.mock("../../lib/youtubeSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/youtubeSearch")>()),
  searchYoutubeApi: (...args: unknown[]) => searchYoutubeMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.YOUTUBE_API_KEY = "test-key";

import {
  refreshStale,
  resolveBySearch,
  seedFromAdds,
  seedFromKaraokeChannels,
  pinPopularPicks,
} from "../../lib/suggestionResolver";
import { readSuggestionVideos, THIN_RESULTS } from "../../lib/suggestionVideos";
import { suggestionCatalog, type CatalogEntry } from "../../lib/suggestionCatalog";
import { YoutubeApiError } from "../../lib/youtubeApi";

const store = () => collection("suggestion_videos");
const events = () => collection("analytics_events");

function row(videoId: string, title = `Track ${videoId}`) {
  return { title, thumbnailUrl: "t", videoId };
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => row(`v${i}`));
}

/** A real catalog song, so the match rule is exercised against real data. */
function anEntry(): CatalogEntry {
  const entry = Array.from(suggestionCatalog().values()).find(
    (e) => !e.nativeTitle && e.title.split(" ").length >= 2
  );
  if (!entry) throw new Error("catalog has no usable entry");
  return entry;
}

function videosListReturns(items: unknown[] | "fail") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      items === "fail"
        ? ({ ok: false, status: 403, json: async () => ({}) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ items }) } as Response)
    )
  );
}

function videoItem(videoId: string, title: string) {
  return {
    id: videoId,
    status: { embeddable: true },
    snippet: { title, thumbnails: { medium: { url: "t" } } },
    contentDetails: { duration: "PT3M30S" },
    statistics: { viewCount: "100" },
  };
}

beforeEach(() => {
  collections.clear();
  vi.clearAllMocks();
  searchYoutubeMock.mockReset();
  harvestMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshStale", () => {
  function staleDoc(id: string) {
    return { _id: id, results: [row("a"), row("b")], topVideoId: "a" };
  }

  it("leaves an entry alone when the lookup fails", async () => {
    // An empty result used to mean "these videos are gone", so one 403 on a
    // spent-quota night deleted every entry it touched.
    store().find.mockReturnValue({
      limit: () => ({ toArray: async () => [staleDoc("x"), staleDoc("y")] }),
    } as any);
    videosListReturns("fail");

    const out = await refreshStale(new Date(), 400);

    expect(store().deleteOne).not.toHaveBeenCalled();
    expect(store().updateOne).not.toHaveBeenCalled();
    expect(out).toMatchObject({ refreshed: 0, skipped: 2 });
  });

  it("deletes only when YouTube confirms every video is gone", async () => {
    store().find.mockReturnValue({
      limit: () => ({ toArray: async () => [staleDoc("x")] }),
    } as any);
    videosListReturns([]);

    const out = await refreshStale(new Date(), 400);

    expect(store().deleteOne).toHaveBeenCalledWith({ _id: "x" });
    expect(out.skipped).toBe(0);
  });

  it("keeps the surviving videos and drops the rest", async () => {
    store().find.mockReturnValue({
      limit: () => ({ toArray: async () => [staleDoc("x")] }),
    } as any);
    videosListReturns([videoItem("a", "Track a")]);

    const out = await refreshStale(new Date(), 400);

    expect(out).toMatchObject({ refreshed: 1, dropped: 1, skipped: 0 });
    const update = store().updateOne.mock.calls[0][1] as any;
    expect(update.$set.results.map((r: any) => r.videoId)).toEqual(["a"]);
  });

  it("does not let one bad doc end the pass over the others", async () => {
    store().find.mockReturnValue({
      limit: () => ({ toArray: async () => [staleDoc("x"), staleDoc("y")] }),
    } as any);
    videosListReturns([videoItem("a", "Track a"), videoItem("b", "Track b")]);
    store().updateOne
      .mockRejectedValueOnce(new Error("write conflict"))
      .mockResolvedValue({ matchedCount: 1 } as any);

    const out = await refreshStale(new Date(), 400);

    expect(out).toMatchObject({ refreshed: 1, skipped: 1 });
  });
});

describe("seedFromAdds", () => {
  function pickedBy(rooms: number, videoId = "vid") {
    events().aggregate.mockReturnValue({
      toArray: async () => [{ _id: { key: anEntry().key, videoId }, rooms }],
    } as any);
  }

  it("stores a video that really is a cut of the song", async () => {
    const entry = anEntry();
    pickedBy(2);
    videosListReturns([
      videoItem("vid", `${entry.artist} - ${entry.title} (Karaoke Version)`),
    ]);

    const out = await seedFromAdds([entry]);

    expect(out).toMatchObject({ seeded: 1, rejected: 0 });
    expect(store().updateOne).toHaveBeenCalled();
  });

  it("refuses a videoId that isn't a cut of the song it was filed under", async () => {
    // Both halves come from a client, so crafted adds could otherwise publish
    // any video as a song's answer for every room.
    const entry = anEntry();
    pickedBy(2);
    videosListReturns([videoItem("vid", "Rick Astley - Never Gonna Give You Up (Karaoke)")]);

    const out = await seedFromAdds([entry]);

    expect(out).toMatchObject({ seeded: 0, rejected: 1 });
    expect(store().updateOne).not.toHaveBeenCalled();
  });

  it("ignores a pick only one room has made", async () => {
    const entry = anEntry();
    pickedBy(1);
    videosListReturns([
      videoItem("vid", `${entry.artist} - ${entry.title} (Karaoke Version)`),
    ]);

    const out = await seedFromAdds([entry]);

    expect(out.seeded).toBe(0);
    expect(store().updateOne).not.toHaveBeenCalled();
  });

  it("writes nothing when the lookup itself failed", async () => {
    const entry = anEntry();
    pickedBy(2);
    videosListReturns("fail");

    const out = await seedFromAdds([entry]);

    expect(out.seeded).toBe(0);
    expect(store().updateOne).not.toHaveBeenCalled();
  });
});

describe("pinPopularPicks", () => {
  it("won't pin a video the entry doesn't hold", async () => {
    store().find.mockReturnValue({
      toArray: async () => [{ _id: "k", results: [row("a")] }],
    } as any);
    events().aggregate.mockReturnValue({
      toArray: async () => [{ _id: { key: "k", videoId: "not-in-list" }, rooms: 9 }],
    } as any);

    const out = await pinPopularPicks();

    expect(out.pinned).toBe(0);
    expect(store().updateOne).not.toHaveBeenCalled();
  });

  it("won't pin on a single room's say-so", async () => {
    store().find.mockReturnValue({
      toArray: async () => [{ _id: "k", results: [row("a"), row("b")] }],
    } as any);
    events().aggregate.mockReturnValue({
      toArray: async () => [{ _id: { key: "k", videoId: "b" }, rooms: 1 }],
    } as any);

    expect((await pinPopularPicks()).pinned).toBe(0);
  });

  it("pins a pick several rooms converged on", async () => {
    store().find.mockReturnValue({
      toArray: async () => [{ _id: "k", results: [row("a"), row("b")] }],
    } as any);
    events().aggregate.mockReturnValue({
      toArray: async () => [{ _id: { key: "k", videoId: "b" }, rooms: 4 }],
    } as any);

    expect((await pinPopularPicks()).pinned).toBe(1);
  });
});

describe("resolveBySearch", () => {
  const entries = () => Array.from(suggestionCatalog().values()).slice(0, 3);

  it("keeps going after one song's transient failure", async () => {
    // A timeout used to forfeit the rest of the night's budget: a day of
    // catalog progress that can't be earned back.
    searchYoutubeMock
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValue([row("a")]);

    const out = await resolveBySearch(entries(), 3);

    expect(searchYoutubeMock).toHaveBeenCalledTimes(3);
    expect(out.searched).toBe(2);
  });

  it("stops the moment the quota answers back", async () => {
    searchYoutubeMock.mockRejectedValue(
      Object.assign(new YoutubeApiError("quota", 403), { quotaExceeded: true })
    );

    const out = await resolveBySearch(entries(), 3);

    expect(searchYoutubeMock).toHaveBeenCalledTimes(1);
    expect(out.searched).toBe(0);
  });
});

describe("readSuggestionVideos", () => {
  it("won't answer with an entry too thin to be worth serving", async () => {
    // A one-row entry used to outrank a fifty-result cache hit, so someone
    // typing a popular song got one video and no route to the others.
    store().findOne.mockResolvedValue({ _id: "k", results: rows(3) } as any);

    expect(await readSuggestionVideos("k")).toBeNull();
  });

  it("answers once the entry holds enough arrangements", async () => {
    store().findOne.mockResolvedValue({
      _id: "k",
      results: rows(THIN_RESULTS),
      topVideoId: "v2",
    } as any);

    const out = await readSuggestionVideos("k");

    expect(out).toHaveLength(THIN_RESULTS);
    expect(out![0].videoId).toBe("v2");
  });
});

describe("seedFromKaraokeChannels", () => {
  const SWEEP = {
    totalPages: 100,
    pagesPerChannel: 10,
    deadlineMs: Number.MAX_SAFE_INTEGER,
    resweepAfterMs: 0,
    maxCutsPerSong: 8,
  };

  /** Drive the sweep with one channel's worth of cuts of a real catalog song. */
  function harvestYields(entry: CatalogEntry, videoIds: string[]) {
    harvestMock.mockImplementation(async (_handles: any, opts: any) => {
      await opts.onChannel({
        channel: "SingKing",
        cursor: { playlistId: "UP_x", pageToken: "1" },
        videos: videoIds.map((videoId) => ({
          videoId,
          title: `${entry.artist} - ${entry.title} (Karaoke Version)`,
          thumbnailUrl: "t",
          channel: "SingKing",
        })),
      });
      return { channels: ["SingKing"], missing: [], units: 1, pages: 1, stoppedEarly: false };
    });
    videosListReturns(
      videoIds.map((v) =>
        videoItem(v, `${entry.artist} - ${entry.title} (Karaoke Version)`)
      )
    );
  }

  it("saves the channel's cursor as soon as its slice is read", async () => {
    const entry = anEntry();
    harvestYields(entry, ["a"]);

    await seedFromKaraokeChannels([entry], SWEEP);

    expect(collection("harvest_cursors").updateOne).toHaveBeenCalledWith(
      { _id: "SingKing" },
      expect.objectContaining({ $set: expect.objectContaining({ pageToken: "1" }) }),
      { upsert: true }
    );
  });

  it("won't overwrite an entry that already answers queries", async () => {
    // A searched entry holds fifty arrangements to the harvest's handful.
    const entry = anEntry();
    harvestYields(entry, ["a", "b"]);
    store().findOne.mockResolvedValue({ _id: entry.key, results: rows(50) } as any);

    const out = await seedFromKaraokeChannels([entry], SWEEP);

    expect(out.seeded).toBe(0);
    expect(store().updateOne).not.toHaveBeenCalled();
  });

  it("merges into a thin entry instead of replacing it", async () => {
    // Successive channels each contribute a cut, so a song no search reached
    // can still accumulate enough to be worth serving.
    const entry = anEntry();
    harvestYields(entry, ["new"]);
    store().findOne.mockResolvedValue({
      _id: entry.key,
      results: [row("already-here")],
    } as any);

    await seedFromKaraokeChannels([entry], SWEEP);

    const update = store().updateOne.mock.calls[0][1] as any;
    expect(update.$set.results.map((r: any) => r.videoId)).toEqual([
      "already-here",
      "new",
    ]);
  });
});
