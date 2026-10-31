import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const rooms = { findOne: vi.fn(), updateOne: vi.fn() };
const videos = { findOne: vi.fn() };
vi.mock("../../lib/mongodb", () => ({
  getRoomsCollection: async () => rooms,
  getKaraokeVideosCollection: async () => videos,
}));

const rateLimitAllowed: Record<string, boolean> = {};
vi.mock("../../lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/limits")>()),
  rateLimit: (_req: unknown, scope: string) => rateLimitAllowed[scope] ?? true,
}));

const trackEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const readSongCutsMock = vi.fn(async (..._args: unknown[]) => null as unknown);
vi.mock("../../lib/corpusRead", () => ({
  readSongCuts: (...args: unknown[]) => readSongCutsMock(...args),
}));

const findSongForQueryMock = vi.fn(async (..._args: unknown[]) => null as string | null);
vi.mock("../../lib/corpusLookup", () => ({
  findSongForQuery: (...args: unknown[]) => findSongForQueryMock(...args),
}));

const blocked = new Set<string>();
vi.mock("../../lib/videoBlocklist", () => ({
  filterBlockedIds: async (ids: string[]) => new Set(ids.filter((id) => blocked.has(id))),
}));

import handler from "../../pages/api/queue/[id]/karaoke-video";

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
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

const roomDoc = {
  id: "ROOM1",
  activeVideoIndex: 1,
  isPlaying: true,
  queue: [
    { id: "e0", userName: "Ann", songTitle: "Old Song", videoId: "old00000000" },
    { id: "e1", userName: "Bea", songTitle: "Queen - Bohemian Rhapsody (Karaoke)", videoId: "bad00000000", originalOffsetSeconds: 3 },
    { id: "e2", userName: "Cal", songTitle: "ABBA - Waterloo (Karaoke)", videoId: "abba0000000" },
  ],
};

const getReq = (entryId: string) =>
  createMockReq({ method: "GET", query: { id: "ROOM1", entryId } });
const postReq = (body: Record<string, unknown>) =>
  createMockReq({ method: "POST", query: { id: "ROOM1" }, body });

const SWAP = { videoId: "good0000000", title: "Bohemian Rhapsody - Sing King", durationSeconds: 360, source: "search" };

beforeEach(() => {
  vi.clearAllMocks();
  blocked.clear();
  for (const k of Object.keys(rateLimitAllowed)) delete rateLimitAllowed[k];
  rooms.findOne.mockResolvedValue(roomDoc);
  rooms.updateOne.mockResolvedValue({ matchedCount: 1 });
  videos.findOne.mockResolvedValue(null);
  readSongCutsMock.mockResolvedValue(null);
  findSongForQueryMock.mockResolvedValue(null);
});

describe("GET /api/queue/[id]/karaoke-video", () => {
  it("offers the corpus cuts of the song the entry's video is filed under", async () => {
    videos.findOne.mockResolvedValue({ _id: "bad00000000", songKeys: ["queen bohemian rhapsody karaoke"] });
    readSongCutsMock.mockResolvedValue([
      { videoId: "cut10000000", title: "Cut one", thumbnailUrl: "t", durationSeconds: 350 },
      { videoId: "cut20000000", title: "Cut two", thumbnailUrl: "t" },
    ]);
    const res = createRes();
    await handler(getReq("e1"), res);

    expect(readSongCutsMock).toHaveBeenCalledWith("queen bohemian rhapsody karaoke");
    expect(findSongForQueryMock).not.toHaveBeenCalled();
    expect(res.getBody()).toEqual({
      candidates: [
        { videoId: "cut10000000", title: "Cut one", durationSeconds: 350 },
        { videoId: "cut20000000", title: "Cut two" },
      ],
    });
  });

  it("falls back to matching the title when the video isn't filed", async () => {
    findSongForQueryMock.mockResolvedValue("abba waterloo karaoke");
    const res = createRes();
    await handler(getReq("e2"), res);

    expect(findSongForQueryMock).toHaveBeenCalledWith("ABBA - Waterloo (Karaoke)");
    expect(readSongCutsMock).toHaveBeenCalledWith("abba waterloo karaoke");
    expect(res.getBody()).toEqual({ candidates: [] });
  });

  it("404s an unknown entry", async () => {
    const res = createRes();
    await handler(getReq("nope"), res);
    expect(res.getStatus()).toBe(404);
  });
});

describe("POST /api/queue/[id]/karaoke-video", () => {
  it("swaps the live song and restarts its clock", async () => {
    const res = createRes();
    await handler(postReq({ entryId: "e1", ...SWAP }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ ok: true, playStartedAt: expect.any(String) });
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", "queue.id": "e1", activeVideoIndex: 1, isPlaying: true },
      {
        $set: {
          "queue.$.videoId": "good0000000",
          "queue.$.songTitle": "Bohemian Rhapsody - Sing King",
          "queue.$.durationSeconds": 360,
          playStartedAt: expect.any(Date),
          lastActivity: expect.any(Date),
        },
        $unset: { "queue.$.originalOffsetSeconds": "", playPausedAt: "", displayPaused: "" },
      }
    );
    expect(trackEventMock).toHaveBeenCalledWith(expect.anything(), "karaoke_video_swapped", {
      roomId: "ROOM1",
      source: "search",
    });
  });

  it("leaves the clock alone for a song still waiting, and drops a length it doesn't know", async () => {
    const res = createRes();
    await handler(postReq({ entryId: "e2", videoId: "good0000000", title: "Waterloo", source: "link" }), res);

    expect(res.getBody()).toEqual({ ok: true, playStartedAt: null });
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", "queue.id": "e2", activeVideoIndex: 1, isPlaying: true },
      {
        $set: { "queue.$.videoId": "good0000000", "queue.$.songTitle": "Waterloo", lastActivity: expect.any(Date) },
        $unset: { "queue.$.originalOffsetSeconds": "", "queue.$.durationSeconds": "" },
      }
    );
  });

  it("409s a song already sung", async () => {
    const res = createRes();
    await handler(postReq({ entryId: "e0", ...SWAP }), res);
    expect(res.getStatus()).toBe(409);
    expect(rooms.updateOne).not.toHaveBeenCalled();
  });

  it("409s when the room moved on between the read and the write", async () => {
    rooms.updateOne.mockResolvedValue({ matchedCount: 0 });
    const res = createRes();
    await handler(postReq({ entryId: "e1", ...SWAP }), res);
    expect(res.getStatus()).toBe(409);
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("422s a tombstoned video", async () => {
    blocked.add("good0000000");
    const res = createRes();
    await handler(postReq({ entryId: "e1", ...SWAP }), res);
    expect(res.getStatus()).toBe(422);
    expect(rooms.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed id", { videoId: "nope" }],
    ["a blank title", { title: "  " }],
    ["an unknown source", { source: "magic" }],
  ])("400s %s", async (_label, override) => {
    const res = createRes();
    await handler(postReq({ entryId: "e1", ...SWAP, ...override }), res);
    expect(res.getStatus()).toBe(400);
  });

  it("429s past its own rate limit", async () => {
    rateLimitAllowed["karaoke-video-pick"] = false;
    const res = createRes();
    await handler(postReq({ entryId: "e1", ...SWAP }), res);
    expect(res.getStatus()).toBe(429);
  });
});
