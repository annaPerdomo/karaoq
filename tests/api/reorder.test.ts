import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room, QueueEntry } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/reorder";

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

const sampleQueue: QueueEntry[] = [
  { id: "a", userName: "Alice", songTitle: "Song A", videoId: "vidvidvidva" },
  { id: "b", userName: "Bob", songTitle: "Song B", videoId: "vidvidvidvb" },
  { id: "c", userName: "Carol", songTitle: "Song C", videoId: "vidvidvidvc" },
];

describe("POST /api/queue/[id]/reorder - Reorder queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates queue order and activeVideoIndex", async () => {
    const room: Room = { id: "ROOM1", queue: sampleQueue, activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const reorderedQueue = [sampleQueue[2], sampleQueue[0], sampleQueue[1]];
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: reorderedQueue, activeVideoIndex: 1 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    // Optimistic write: the filter pins the queue the merge was computed
    // from, so a concurrent write forces a re-merge instead of a clobber.
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", queue: sampleQueue },
      { $set: { queue: reorderedQueue, activeVideoIndex: 1, lastActivity: expect.any(Date) } }
    );
  });

  it("appends songs added since the host's snapshot instead of deleting them", async () => {
    const added: QueueEntry = { id: "d", userName: "Dan", songTitle: "Song D", videoId: "vidvidvidvd" };
    const room: Room = {
      id: "ROOM1",
      queue: [...sampleQueue, added],
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    // The host reorders a stale snapshot that doesn't know about "d" yet.
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: [sampleQueue[2], sampleQueue[0], sampleQueue[1]], activeVideoIndex: 0 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const written = mockCollection.updateOne.mock.calls[0][1].$set.queue;
    expect(written.map((e: QueueEntry) => e.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("drops payload entries no longer on the server instead of resurrecting them", async () => {
    // "b" was removed since the host's snapshot.
    const room: Room = {
      id: "ROOM1",
      queue: [sampleQueue[0], sampleQueue[2]],
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: [sampleQueue[2], sampleQueue[1], sampleQueue[0]], activeVideoIndex: 0 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const written = mockCollection.updateOne.mock.calls[0][1].$set.queue;
    expect(written.map((e: QueueEntry) => e.id)).toEqual(["c", "a"]);
  });

  it("retries the merge on write conflict and 409s when it keeps losing", async () => {
    const room: Room = { id: "ROOM1", queue: sampleQueue, activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    // Every optimistic write loses the race.
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: sampleQueue, activeVideoIndex: 0 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.findOne).toHaveBeenCalledTimes(3);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(3);
  });

  it("handles JSON string body", async () => {
    const room: Room = { id: "ROOM1", queue: sampleQueue, activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: JSON.stringify({ queue: sampleQueue, activeVideoIndex: 2 }),
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: "not valid json{{{",
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect((res.getBody() as { message: string }).message).toBe("Invalid JSON body.");
  });

  it("returns 400 when queue is not an array", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: "not-an-array", activeVideoIndex: 0 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("returns 400 when activeVideoIndex is not a number", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: [], activeVideoIndex: "zero" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("returns 404 when room does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1" },
      body: { queue: [], activeVideoIndex: 0 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });
});
