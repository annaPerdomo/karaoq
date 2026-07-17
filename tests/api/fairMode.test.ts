import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { QueueEntry, Room } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/fair-mode";

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

function entry(id: string, userName: string): QueueEntry {
  return { id, userName, songTitle: `Song ${id}`, videoId: "dQw4w9WgXcQ" };
}

describe("POST /api/queue/[id]/fair-mode - Toggle fair rotation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables with a plain $set, leaving the queue order alone", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", enabled: "false" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.findOne).not.toHaveBeenCalled();
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { fairMode: false, lastActivity: expect.any(Date) } }
    );
  });

  it("enables via CAS and re-sorts only the upcoming songs (worked example)", async () => {
    // queue = [history, current, A1, A2, B1, C1, A3], pointer on "current".
    const [hist, cur, a1, a2, b1, c1, a3] = [
      entry("h", "H"), entry("cur", "X"),
      entry("a1", "A"), entry("a2", "A"), entry("b1", "B"), entry("c1", "C"), entry("a3", "A"),
    ];
    const room: Room = {
      id: "ROOM1",
      queue: [hist, cur, a1, a2, b1, c1, a3],
      activeVideoIndex: 1,
      isPlaying: true,
      reactionsEnabled: true,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", enabled: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      // Queue-equality filter: the sorted array is only valid for this snapshot.
      { id: "ROOM1", queue: room.queue },
      {
        $set: {
          queue: [hist, cur, a1, b1, c1, a2, a3],
          fairMode: true,
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("counts the current song toward rounds without moving it (acceptance case)", async () => {
    // Fresh room: pointer on A's first song. A's later songs are rounds 1-2,
    // so B and C leapfrog them — but A1 itself must stay at the pointer.
    const [a1, a2, b1, c1, a3] = [
      entry("a1", "A"), entry("a2", "A"), entry("b1", "B"), entry("c1", "C"), entry("a3", "A"),
    ];
    const room: Room = {
      id: "ROOM1",
      queue: [a1, a2, b1, c1, a3],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", enabled: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set.queue).toEqual([a1, b1, c1, a2, a3]);
  });

  it("retries the enable three times, then 409s", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: [entry("a1", "A")],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
    };
    mockCollection.findOne.mockResolvedValue(room);
    // A concurrent queue write keeps invalidating the snapshot.
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", enabled: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.findOne).toHaveBeenCalledTimes(3);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(3);
  });

  it("404s when the room does not exist on enable", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", enabled: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("404s when the room does not exist on disable", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", enabled: "false" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("400s on a bad enabled param", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", enabled: "yes" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1", enabled: "true" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
