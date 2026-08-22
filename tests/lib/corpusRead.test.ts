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

import { pinTopFirst, readSongCuts } from "../../lib/corpusRead";

const videos = () => collection("karaoke_videos");
const songs = () => collection("karaoke_songs");

function row(videoId: string) {
  return { title: `Song ${videoId}`, thumbnailUrl: "t", videoId };
}

function videoDoc(videoId: string, extra: Record<string, unknown> = {}) {
  return {
    _id: videoId,
    title: `Song ${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mq.jpg`,
    sources: {},
    firstSeenAt: new Date(),
    refreshedAt: new Date(),
    ...extra,
  };
}

function songDoc(cuts: string[], extra: Record<string, unknown> = {}) {
  return {
    _id: "abba dancing queen karaoke",
    title: "Dancing Queen",
    artist: "ABBA",
    cuts,
    addCount: 0,
    addsByCountry: {},
    demand: 0,
    ...extra,
  };
}

describe("pinTopFirst", () => {
  it("moves the community's pick to the top and badges it", () => {
    const pinned = pinTopFirst([row("a"), row("b"), row("c")], "b");

    expect(pinned.map((r) => r.videoId)).toEqual(["b", "a", "c"]);
    expect(pinned[0].pinned).toBe(true);
    // Only the winner is badged, or the marker would mean nothing.
    expect(pinned.slice(1).some((r) => r.pinned)).toBe(false);
  });

  it("keeps the list intact when nothing has been picked yet", () => {
    const results = [row("a"), row("b")];

    expect(pinTopFirst(results, undefined)).toEqual(results);
  });

  it("ignores a pick the list no longer holds", () => {
    // A refresh can drop a deleted video; the badge must not point at a row
    // that isn't there, and the list must not lose one either.
    const results = [row("a"), row("b")];

    expect(pinTopFirst(results, "gone")).toEqual(results);
  });

  it("doesn't duplicate the pick it promotes", () => {
    const pinned = pinTopFirst([row("a"), row("b")], "a");

    expect(pinned).toHaveLength(2);
    expect(pinned.filter((r) => r.videoId === "a")).toHaveLength(1);
  });
});

describe("readSongCuts", () => {
  beforeEach(() => {
    collections.forEach((c) => c.clear());
  });

  it("hydrates the cuts in the order the song ranks them", async () => {
    songs().seed(songDoc(["b", "a"]));
    videos().seed(videoDoc("a", { durationSeconds: 210, viewCount: 90 }));
    videos().seed(videoDoc("b"));

    const cuts = await readSongCuts("abba dancing queen karaoke");

    expect(cuts?.map((r) => r.videoId)).toEqual(["b", "a"]);
    // The exact shape /api/search returns; the add flow can't tell the two apart.
    expect(cuts?.[1]).toEqual({
      videoId: "a",
      title: "Song a",
      thumbnailUrl: "https://i.ytimg.com/vi/a/mq.jpg",
      durationSeconds: 210,
      viewCount: 90,
    });
    // Absent stays absent rather than 0 — the UI badges on `> 0`.
    expect(cuts?.[0]).not.toHaveProperty("durationSeconds");
  });

  it("serves the community's pick first, badged", async () => {
    songs().seed(songDoc(["a", "b"], { topVideoId: "b" }));
    videos().seed(videoDoc("a"));
    videos().seed(videoDoc("b"));

    const cuts = await readSongCuts("abba dancing queen karaoke");

    expect(cuts?.map((r) => r.videoId)).toEqual(["b", "a"]);
    expect(cuts?.[0].pinned).toBe(true);
  });

  it("skips a cut whose video row has expired", async () => {
    // A TTL deletion announces itself to nothing: the dead id survives on the song.
    songs().seed(songDoc(["gone", "a"]));
    videos().seed(videoDoc("a"));

    const cuts = await readSongCuts("abba dancing queen karaoke");

    expect(cuts?.map((r) => r.videoId)).toEqual(["a"]);
  });

  it("skips a cut no fetch of ours has ever filled in", async () => {
    // An add creates the row from a request body — a client-typed title, no
    // picture — and it stays that way until the sweep reads it from videos.list.
    songs().seed(songDoc(["unseen", "a"]));
    videos().seed(
      videoDoc("unseen", { title: "Anything The Request Body Said", thumbnailUrl: "" })
    );
    videos().seed(videoDoc("a"));

    const cuts = await readSongCuts("abba dancing queen karaoke");

    expect(cuts?.map((r) => r.videoId)).toEqual(["a"]);
  });

  it("answers null when a song holds nothing but unfilled rows", async () => {
    songs().seed(songDoc(["unseen"]));
    videos().seed(videoDoc("unseen", { thumbnailUrl: "" }));

    expect(await readSongCuts("abba dancing queen karaoke")).toBeNull();
  });

  it("answers null for a song nobody has resolved yet", async () => {
    songs().seed(songDoc([]));

    expect(await readSongCuts("abba dancing queen karaoke")).toBeNull();
  });

  it("answers null when every cut has expired", async () => {
    songs().seed(songDoc(["gone"]));

    expect(await readSongCuts("abba dancing queen karaoke")).toBeNull();
  });

  it("answers null for a song the corpus has never heard of", async () => {
    expect(await readSongCuts("nobody has ever sung this")).toBeNull();
  });

  it("reads a store failure as unresolved rather than an error", async () => {
    // A browse tap has somewhere to fall through to; a failure page is not it.
    songs().seed(songDoc(["a"]));
    const boom = vi
      .spyOn(videos(), "find")
      .mockImplementation(() => {
        throw new Error("connection reset");
      });

    expect(await readSongCuts("abba dancing queen karaoke")).toBeNull();
    boom.mockRestore();
  });
});
