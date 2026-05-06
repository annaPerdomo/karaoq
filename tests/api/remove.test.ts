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

import handler from "../../pages/api/queue/[id]/remove";

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

function makeQueue(...ids: string[]): QueueEntry[] {
  return ids.map((id, i) => ({
    id,
    userName: `User${i}`,
    songTitle: `Song ${i}`,
    videoId: `vid${i}`,
  }));
}

describe("POST /api/queue/[id]/remove - Remove entry from queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes an entry from the queue", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b", "c"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "b" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const updateCall = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(updateCall.queue).toHaveLength(2);
    expect(updateCall.queue.map((e: QueueEntry) => e.id)).toEqual(["a", "c"]);
  });

  it("decrements activeVideoIndex when removing entry before current", async () => {
    // Queue: [a, b, c], activeVideoIndex = 2 (currently on "c")
    // Remove "a" (index 0) → new activeVideoIndex should be 1
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b", "c"),
      activeVideoIndex: 2,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "a" },
    });
    const res = createRes();
    await handler(req, res);

    const updateCall = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(updateCall.activeVideoIndex).toBe(1);
  });

  it("keeps activeVideoIndex when removing entry after current", async () => {
    // Queue: [a, b, c], activeVideoIndex = 0 (currently on "a")
    // Remove "c" (index 2) → activeVideoIndex stays at 0
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b", "c"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "c" },
    });
    const res = createRes();
    await handler(req, res);

    const updateCall = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(updateCall.activeVideoIndex).toBe(0);
  });

  it("clamps activeVideoIndex when removing the current (last) song", async () => {
    // Queue: [a, b], activeVideoIndex = 1 (on "b", the last entry)
    // Remove "b" → new queue has 1 entry, activeVideoIndex should clamp to 0
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b"),
      activeVideoIndex: 1,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "b" },
    });
    const res = createRes();
    await handler(req, res);

    const updateCall = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(updateCall.activeVideoIndex).toBe(0);
    expect(updateCall.queue).toHaveLength(1);
  });

  it("handles removing the only entry in queue", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "a" },
    });
    const res = createRes();
    await handler(req, res);

    const updateCall = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(updateCall.queue).toHaveLength(0);
    expect(updateCall.activeVideoIndex).toBe(0);
  });

  it("returns 404 when entry does not exist in queue", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "nonexistent" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 when room does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", entryId: "a" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });
});
