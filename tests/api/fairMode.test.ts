import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { QueueEntry, Room } from "../../pages/api/types";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

const trackEvent = vi.fn();
vi.mock("../../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

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

function entry(id: string, userName: string, addedAt?: number): QueueEntry {
  const e: QueueEntry = { id, userName, songTitle: `Song ${id}`, videoId: "dQw4w9WgXcQ" };
  if (addedAt !== undefined) e.addedAt = addedAt;
  return e;
}

describe("POST /api/queue/[id]/fair-mode - Toggle fair rotation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables via CAS and restores the order the songs were queued in", async () => {
    // Sitting in fair order (A, B, A) but queued A1, A2, B1 — disabling must undo the spacing.
    const [cur, a1, a2, b1] = [
      entry("cur", "X", 1), entry("a1", "A", 2), entry("a2", "A", 3), entry("b1", "B", 4),
    ];
    const room: Room = {
      id: "ROOM1",
      queue: [cur, a1, b1, a2],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      fairMode: true,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", enabled: "false" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    // activeVideoIndex is in the CAS: an advance changes the pointer without touching the queue.
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", queue: room.queue, activeVideoIndex: 0 },
      {
        $set: {
          queue: [cur, a1, a2, b1],
          fairMode: false,
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("tracks the toggle for analytics, but only once the write lands", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: [entry("a1", "A", 1)],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await handler(
      createMockReq({ method: "POST", query: { id: "ROOM1", enabled: "true" } }),
      createRes()
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.anything(),
      "fair_mode_toggled",
      { roomId: "ROOM1", fairMode: true }
    );
  });

  it("does not track a toggle whose write never landed", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: [entry("a1", "A", 1)],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
    };
    mockCollection.findOne.mockResolvedValue(room);
    // Every CAS attempt loses, so the handler 409s.
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const res = createRes();
    await handler(
      createMockReq({ method: "POST", query: { id: "ROOM1", enabled: "true" } }),
      res
    );
    expect(res.getStatus()).toBe(409);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("round-trips: on then off returns the queue to its original order", async () => {
    const [cur, a1, a2, b1, c1] = [
      entry("cur", "X", 1), entry("a1", "A", 2), entry("a2", "A", 3),
      entry("b1", "B", 4), entry("c1", "C", 5),
    ];
    const original = [cur, a1, a2, b1, c1];

    // ON
    mockCollection.findOne.mockResolvedValue({
      id: "ROOM1", queue: original, activeVideoIndex: 0,
      isPlaying: true, reactionsEnabled: true,
    } as Room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    await handler(
      createMockReq({ method: "POST", query: { id: "ROOM1", enabled: "true" } }),
      createRes()
    );
    const fair = mockCollection.updateOne.mock.calls.at(-1)![1].$set.queue as QueueEntry[];
    // X is on stage and stays; A's second song falls behind B and C.
    expect(fair.map((e) => e.id)).toEqual(["cur", "a1", "b1", "c1", "a2"]);

    // OFF, from the fair arrangement
    vi.clearAllMocks();
    mockCollection.findOne.mockResolvedValue({
      id: "ROOM1", queue: fair, activeVideoIndex: 0,
      isPlaying: true, reactionsEnabled: true, fairMode: true,
    } as Room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    await handler(
      createMockReq({ method: "POST", query: { id: "ROOM1", enabled: "false" } }),
      createRes()
    );
    const restored = mockCollection.updateOne.mock.calls.at(-1)![1].$set.queue as QueueEntry[];
    expect(restored.map((e) => e.id)).toEqual(original.map((e) => e.id));
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
    const [filter, update] = mockCollection.updateOne.mock.calls[0];
    // The sorted array is only valid for this exact queue + pointer snapshot.
    expect(filter).toEqual({ id: "ROOM1", queue: room.queue, activeVideoIndex: 1 });
    expect(update.$set.fairMode).toBe(true);
    expect((update.$set.queue as QueueEntry[]).map((e) => e.id)).toEqual(
      [hist, cur, a1, b1, c1, a2, a3].map((e) => e.id)
    );
    // History is left exactly as it was — it neither moves nor gets stamped.
    expect(update.$set.queue[0]).toBe(hist);
  });

  it("counts the current song toward rounds without moving it (acceptance case)", async () => {
    // A's later songs are rounds 1-2, so B and C leapfrog them; A1 stays at the pointer.
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
    const written = update.$set.queue as QueueEntry[];
    expect(written.map((e) => e.id)).toEqual([a1, b1, c1, a2, a3].map((e) => e.id));
    // Legacy entries pick up arrival times so disabling can restore this order.
    expect(written.every((e) => typeof e.addedAt === "number")).toBe(true);
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
