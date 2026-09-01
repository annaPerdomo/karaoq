import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
process.env.YOUTUBE_API_KEY = "test-key";

import handler from "../../pages/api/queue/unplayable";
import { ledgerDay } from "../../lib/corpusBudget";

const ID = "dQw4w9WgXcQ";
const SONG_KEY = "abba dancing queen karaoke";
const ROOM = "ABCD";

const videos = () => collection("karaoke_videos");
const songs = () => collection("karaoke_songs");
const blocked = () => collection("blocked_videos");
const cache = () => collection("search_cache");
const rooms = () => collection("rooms");
const state = () => collection("cron_state");

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader() { return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
  };
}

function report(body: Record<string, unknown>) {
  return createMockReq({ method: "POST", body: { roomId: ROOM, ...body } as any });
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

function videoItem(over: Record<string, any> = {}) {
  return {
    items: [
      {
        id: ID,
        snippet: {
          title: "Dancing Queen (Karaoke)",
          thumbnails: { medium: { url: `https://i.ytimg.com/vi/${ID}/mq.jpg` } },
        },
        contentDetails: { duration: "PT3M33S" },
        statistics: { viewCount: "120000" },
        status: { embeddable: true },
        ...over,
      },
    ],
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  collections.forEach((c) => c.clear());
  rateLimitMock.mockReturnValue(true);
  fetchMock.mockImplementation(async () => jsonResponse(videoItem()));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});

  rooms().seed({
    _id: "room-1",
    id: ROOM,
    queue: [{ id: "entry-1", videoId: ID, songTitle: "Dancing Queen", userName: "Ana" }],
  });
  videos().seed({ _id: ID, title: "Dancing Queen (Karaoke)", songKeys: [SONG_KEY] });
  songs().seed({ _id: SONG_KEY, cuts: [ID, "otherVideoX"], topVideoId: ID });
  cache().seed({
    _id: "cache-1",
    key: "dancing queen karaoke|US",
    results: [{ videoId: ID }, { videoId: "otherVideoX" }],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/queue/unplayable", () => {
  it("tombstones and drops a video YouTube confirms the owner blocked", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(videoItem({ status: { embeddable: false } }))
    );

    const res = createRes();
    await handler(report({ videoId: ID, code: 150 }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ tombstoned: true });

    // Re-verified with one videos.list call — never a search.
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/youtube/v3/videos");
    expect(url).not.toContain("/youtube/v3/search");
    expect(url).toContain("status");

    expect(blocked().get(ID)).toMatchObject({ reason: "playback_failed" });
    expect(videos().get(ID)).toBeNull();
    expect(songs().get(SONG_KEY)).toMatchObject({ cuts: ["otherVideoX"] });
    expect(songs().get(SONG_KEY)?.topVideoId).toBeUndefined();
    expect(cache().get("cache-1")?.results).toEqual([{ videoId: "otherVideoX" }]);
  });

  it("tombstones a video that is no longer on YouTube", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ items: [] }));

    const res = createRes();
    await handler(report({ videoId: ID, code: 100 }), res);

    expect(res.getBody()).toMatchObject({ tombstoned: true });
    expect(blocked().get(ID)).toMatchObject({ reason: "playback_failed" });
    expect(videos().get(ID)).toBeNull();
  });

  it("changes nothing when YouTube says the video is fine", async () => {
    const res = createRes();
    await handler(report({ videoId: ID, code: 150 }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ tombstoned: false });
    expect(blocked().all()).toEqual([]);
    expect(videos().get(ID)).not.toBeNull();
    expect(songs().get(SONG_KEY)).toMatchObject({ cuts: [ID, "otherVideoX"] });
  });

  it("changes nothing when YouTube can't be reached", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, false, 503));

    const res = createRes();
    await handler(report({ videoId: ID, code: 101 }), res);

    expect(res.getStatus()).toBe(200);
    expect(blocked().all()).toEqual([]);
    expect(videos().get(ID)).not.toBeNull();
  });

  it("answers an already-tombstoned video without spending a call", async () => {
    blocked().seed({ _id: ID, reason: "playback_failed", blockedAt: new Date() });

    const res = createRes();
    await handler(report({ videoId: ID, code: 150 }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ tombstoned: true });
    expect(fetchMock).not.toHaveBeenCalled();
    // Tombstoned is not unfiled: a cut filed before the block outlives it.
    expect(videos().get(ID)).toBeNull();
    expect(songs().get(SONG_KEY)).toMatchObject({ cuts: ["otherVideoX"] });
  });

  it("turns away a video the named room never had queued", async () => {
    const res = createRes();
    await handler(report({ roomId: ROOM, videoId: "0123456789a", code: 150 }), res);

    expect(res.getStatus()).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(blocked().all()).toEqual([]);
  });

  it("turns away a report that names no room at all", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "POST", body: { videoId: ID, code: 150 } as any }),
      res
    );

    expect(res.getStatus()).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bills the verification to the day's ledger", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(videoItem({ status: { embeddable: false } }))
    );

    await handler(report({ videoId: ID, code: 150 }), createRes());

    expect(state().get(`budget:${ledgerDay(Date.now())}`)).toMatchObject({
      lookups: 1,
    });
  });

  it("rejects a code that says nothing about the video", async () => {
    const res = createRes();
    await handler(report({ videoId: ID, code: 5 }), res);

    expect(res.getStatus()).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(blocked().all()).toEqual([]);
  });

  it("rejects a malformed video id without spending a call", async () => {
    const res = createRes();
    await handler(report({ videoId: "not-an-id", code: 150 }), res);

    expect(res.getStatus()).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(blocked().all()).toEqual([]);
  });

  it("honours the rate limit", async () => {
    rateLimitMock.mockReturnValue(false);

    const res = createRes();
    await handler(report({ videoId: ID, code: 150 }), res);

    expect(res.getStatus()).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(videos().get(ID)).not.toBeNull();
  });

  it("rejects a non-POST", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET", body: { videoId: ID } }), res);

    expect(res.getStatus()).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
