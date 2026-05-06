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
  { id: "a", userName: "Alice", songTitle: "Song A", videoId: "va" },
  { id: "b", userName: "Bob", songTitle: "Song B", videoId: "vb" },
  { id: "c", userName: "Carol", songTitle: "Song C", videoId: "vc" },
];

describe("POST /api/queue/[id]/reorder - Reorder queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates queue order and activeVideoIndex", async () => {
    const room: Room = { id: "ROOM1", queue: sampleQueue, activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const reorderedQueue = [sampleQueue[2], sampleQueue[0], sampleQueue[1]];
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { queue: reorderedQueue, activeVideoIndex: 1 },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { queue: reorderedQueue, activeVideoIndex: 1 } }
    );
  });

  it("handles JSON string body", async () => {
    const room: Room = { id: "ROOM1", queue: sampleQueue, activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

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
