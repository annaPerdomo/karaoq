import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room, QueueEntry } from "../../pages/api/types";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
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
    videoId: `vidvidvid${i}`,
  }));
}

describe("POST /api/queue/[id]/remove - Remove entry from queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the entry with an atomic $pull (concurrent adds survive)", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b", "c"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "b" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    // The write targets only the removed entry — never a full-array $set that
    // could clobber songs added concurrently.
    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $pull: { queue: { id: "b" } }, $set: { lastActivity: expect.any(Date) } },
      { returnDocument: "before" }
    );
  });

  it("decrements activeVideoIndex when removing entry before current", async () => {
    // Queue: [a, b, c], activeVideoIndex = 2 (currently on "c")
    // Remove "a" (index 0) → guarded $inc shifts the playhead down one.
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b", "c"),
      activeVideoIndex: 2,
      isPlaying: false,
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "a" },
    });
    const res = createRes();
    await handler(req, res);

    // The $gt guard re-checks the index at write time so a concurrent
    // video-ended advance can't be rewound by a stale decrement.
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", activeVideoIndex: { $gt: 0 } },
      { $inc: { activeVideoIndex: -1 } }
    );
  });

  it("keeps activeVideoIndex when removing entry after current", async () => {
    // Queue: [a, b, c], activeVideoIndex = 0 (currently on "a")
    // Remove "c" (index 2) → the $gt: 2 guard can't match index 0, so the
    // playhead stays put.
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b", "c"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "c" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", activeVideoIndex: { $gt: 2 } },
      { $inc: { activeVideoIndex: -1 } }
    );
  });

  it("keeps activeVideoIndex when removing the current (last) song so UI shows empty state", async () => {
    // Queue: [a, b], activeVideoIndex = 1 (on "b", the last entry)
    // Remove "b" → the $gt: 1 guard doesn't match index 1, so it stays
    // pointing past the queue and the UI shows the empty state instead of
    // resurrecting "a" from history.
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b"),
      activeVideoIndex: 1,
      isPlaying: false,
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "b" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", activeVideoIndex: { $gt: 1 } },
      { $inc: { activeVideoIndex: -1 } }
    );
  });

  it("handles removing the only entry in queue", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", entryId: "a" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.findOneAndUpdate.mock.calls[0][1].$pull).toEqual({
      queue: { id: "a" },
    });
  });

  it("returns 404 when entry does not exist in queue", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: makeQueue("a", "b"),
      activeVideoIndex: 0,
      isPlaying: false,
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(room);

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
    mockCollection.findOneAndUpdate.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", entryId: "a" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });
});
