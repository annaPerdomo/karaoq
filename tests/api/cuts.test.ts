import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
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

const rateLimitMock = vi.fn(() => true);
vi.mock("../../lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/limits")>()),
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/suggestions/cuts";

const videos = () => collection("karaoke_videos");
const songs = () => collection("karaoke_songs");

const SONG_KEY = "abba dancing queen karaoke";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
    getHeader: (name: string) => headers[name],
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
    getHeader: (name: string) => string | undefined;
  };
}

function seedSong(cuts: string[], topVideoId?: string) {
  songs().seed({
    _id: SONG_KEY,
    title: "Dancing Queen",
    artist: "ABBA",
    cuts,
    addCount: 0,
    addsByCountry: {},
    demand: 0,
    ...(topVideoId ? { topVideoId } : {}),
  });
  for (const id of cuts) {
    videos().seed({
      _id: id,
      title: `Song ${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/mq.jpg`,
      durationSeconds: 210,
      viewCount: 1000,
      sources: {},
      firstSeenAt: new Date(),
      refreshedAt: new Date(),
    });
  }
}

async function get(query: Record<string, unknown>) {
  const res = createRes();
  await handler(createMockReq({ query: query as never }), res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(true);
  collections.forEach((c) => c.clear());
});

describe("GET /api/suggestions/cuts", () => {
  it("serves a resolved song's cuts with the pick first, spending no quota", async () => {
    seedSong(["a", "b", "c"], "c");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await get({ song: SONG_KEY });

    expect(res.getStatus()).toBe(200);
    // The one claim the corpus exists to make: browsing never reaches search.list.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.getHeader("x-karaoq-suggestions")).toBe("corpus");
    // Same for everyone, rewritten only overnight: the CDN takes the repeat taps.
    expect(res.getHeader("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    const body = res.getBody() as { videoId: string; pinned?: boolean }[];
    expect(body.map((r) => r.videoId)).toEqual(["c", "a", "b"]);
    expect(body[0].pinned).toBe(true);
    vi.unstubAllGlobals();
  });

  it("answers in the exact shape /api/search does", async () => {
    seedSong(["a"]);

    const res = await get({ song: SONG_KEY });

    // Anything else and the results list and add flow need a second code path.
    expect(res.getBody()).toEqual([
      {
        videoId: "a",
        title: "Song a",
        thumbnailUrl: "https://i.ytimg.com/vi/a/mq.jpg",
        durationSeconds: 210,
        viewCount: 1000,
      },
    ]);
  });

  it("404s a song the corpus doesn't hold", async () => {
    const res = await get({ song: "nobody has ever sung this" });

    expect(res.getStatus()).toBe(404);
    expect(res.getBody()).toEqual({ code: 404 });
  });

  it("404s a song whose cuts have all expired", async () => {
    seedSong(["a"]);
    videos().clear();

    const res = await get({ song: SONG_KEY });

    expect(res.getStatus()).toBe(404);
  });

  it.each([
    ["missing", {}],
    ["blank", { song: "   " }],
    ["over-long", { song: "x".repeat(201) }],
    ["repeated", { song: ["a", "b"] }],
  ])("404s a %s song key", async (_name, query) => {
    const res = await get(query);

    expect(res.getStatus()).toBe(404);
  });

  it("429s once the per-IP limit is spent", async () => {
    seedSong(["a"]);
    rateLimitMock.mockReturnValue(false);

    const res = await get({ song: SONG_KEY });

    expect(res.getStatus()).toBe(429);
    // A 429 here costs a live search, and a venue browses from one IP.
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      "cuts",
      120,
      60_000
    );
  });

  it("rejects a non-GET", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "POST", query: { song: SONG_KEY } }), res);

    expect(res.getStatus()).toBe(405);
  });
});
