import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
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

import handler from "../../pages/api/queue/[id]/song-limit";

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

describe("POST /api/queue/[id]/song-limit - the room's per-song time limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("stores an offered limit", async () => {
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", seconds: "240" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { songLimitSeconds: 240, lastActivity: expect.any(Date) } }
    );
    expect(trackEvent).toHaveBeenCalledWith(req, "song_limit_set", {
      roomId: "ROOM1",
      songLimitSeconds: 240,
    });
  });

  it("clears the limit", async () => {
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", seconds: "clear" } });
    await handler(req, createRes());

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { lastActivity: expect.any(Date) }, $unset: { songLimitSeconds: "" } }
    );
    expect(trackEvent).toHaveBeenCalledWith(expect.anything(), "song_limit_set", {
      roomId: "ROOM1",
      songLimitSeconds: null,
    });
  });

  it("rejects a limit that is not on offer", async () => {
    // A 1-second limit would cut every song the moment it starts.
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", seconds: "1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a room that does not exist", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const req = createMockReq({ method: "POST", query: { id: "NOPE", seconds: "240" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
