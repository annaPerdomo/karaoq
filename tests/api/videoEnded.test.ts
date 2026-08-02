import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room } from "../../pages/api/types";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({ collection: () => mockCollection }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/queue/[id]/video-ended";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

function roomWithSongs(count: number, activeVideoIndex: number): Room {
  return {
    id: "ROOM1",
    queue: Array.from({ length: count }, (_, i) => ({
      id: `e${i}`,
      userName: `Singer ${i}`,
      songTitle: `Song ${i}`,
      videoId: `v${i}`,
    })),
    activeVideoIndex,
    isPlaying: true,
    reactionsEnabled: true,
  };
}

describe("POST /api/queue/[id]/video-ended - Display reports a finished song", () => {
  beforeEach(() => vi.clearAllMocks());

  it("advances to the next song and stops playback", async () => {
    mockCollection.findOne.mockResolvedValue(roomWithSongs(3, 0));
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", index: "0" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as { advanced: boolean }).advanced).toBe(true);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", activeVideoIndex: 0, isPlaying: true },
      {
        $set: { activeVideoIndex: 1, isPlaying: false, lastActivity: expect.any(Date) },
        $unset: {
          playToken: "",
          displayPaused: "",
          playStartedAt: "",
          playPausedAt: "",
        },
      }
    );
  });

  it("only stops playback when the last song ends", async () => {
    mockCollection.findOne.mockResolvedValue(roomWithSongs(3, 2));
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", index: "2" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", activeVideoIndex: 2, isPlaying: true },
      {
        $set: { isPlaying: false, lastActivity: expect.any(Date) },
        $unset: {
          playToken: "",
          displayPaused: "",
          playStartedAt: "",
          playPausedAt: "",
        },
      }
    );
  });

  it("is a no-op when the room already moved past the reported song", async () => {
    // e.g. a duplicate report, or the host already advanced manually
    mockCollection.findOne.mockResolvedValue({
      ...roomWithSongs(3, 1),
      isPlaying: false,
    });
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", index: "0" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as { advanced: boolean }).advanced).toBe(false);
    // The guarded filter can't match a room that isn't playing index 0
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", activeVideoIndex: 0, isPlaying: true },
      expect.anything()
    );
  });

  it("rejects a non-numeric index with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", index: "abc" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for non-existent room", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", index: "0" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1", index: "0" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
