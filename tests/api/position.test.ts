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

import handler from "../../pages/api/queue/[id]/position";

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

describe("POST /api/queue/[id]/position - Advance song position", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeQueue(length: number) {
    return Array.from({ length }, (_, i) => ({
      id: `e${i}`,
      userName: `User${i}`,
      songTitle: `Song ${i}`,
      videoId: `vidvidvid${i}`,
    }));
  }

  it("updates position and resets isPlaying to false", async () => {
    const room: Room = { id: "ROOM1", queue: makeQueue(3), activeVideoIndex: 0, isPlaying: true };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", activeVideoIndex: "2" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: { activeVideoIndex: 2, isPlaying: false, lastActivity: expect.any(Date) },
        $unset: {
          playToken: "",
          displayPaused: "",
          playStartedAt: "",
          playPausedAt: "",
          autoStartAt: "",
          endedEntryId: "",
        },
      }
    );
  });

  it("counts the landed-on song in when auto-advance is on", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue(3),
      activeVideoIndex: 0,
      isPlaying: true,
      autoAdvance: { enabled: true, gapSeconds: 20 },
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const before = Date.now();

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", activeVideoIndex: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const [, update] = mockCollection.updateOne.mock.calls[0];
    const at = update.$set.autoStartAt.getTime();
    expect(at).toBeGreaterThanOrEqual(before + 20_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 20_000);
    expect(update.$unset).not.toHaveProperty("autoStartAt");
    expect(update.$unset.endedEntryId).toBe("");
  });

  it("stamps nothing when a skip drains the queue", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue(2),
      activeVideoIndex: 1,
      isPlaying: true,
      autoAdvance: { enabled: true, gapSeconds: 20 },
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", activeVideoIndex: "2" },
    });
    const res = createRes();
    await handler(req, res);

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set).not.toHaveProperty("autoStartAt");
    expect(update.$unset.autoStartAt).toBe("");
  });

  it("treats a same-index write as already applied without touching play state", async () => {
    // A second device's stale skip (its view one poll behind an advance that
    // already landed) must not stop whatever is playing.
    const room: Room = { id: "ROOM1", queue: makeQueue(3), activeVideoIndex: 1, isPlaying: true };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", activeVideoIndex: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("clamps an out-of-range index to just past the queue", async () => {
    const room: Room = { id: "ROOM1", queue: makeQueue(2), activeVideoIndex: 0, isPlaying: true };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", activeVideoIndex: "9999" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne.mock.calls[0][1].$set.activeVideoIndex).toBe(2);
  });

  it("returns 400 for non-numeric activeVideoIndex", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", activeVideoIndex: "abc" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it.each(["-1", "3.9"])(
    "returns 400 for invalid index %s (players trust activeVideoIndex)",
    async (raw) => {
      const req = createMockReq({
        method: "POST",
        query: { id: "ROOM1", activeVideoIndex: raw },
      });
      const res = createRes();
      await handler(req, res);

      expect(res.getStatus()).toBe(400);
      expect(mockCollection.findOne).not.toHaveBeenCalled();
    }
  );

  it("returns 404 when room does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", activeVideoIndex: "0" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({
      method: "GET",
      query: { id: "ROOM1", activeVideoIndex: "0" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
