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

import handler from "../../pages/api/queue/[id]/session-end";

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

async function post(at: string | undefined, id = "ROOM1") {
  const req = createMockReq({
    method: "POST",
    query: at === undefined ? { id } : { id, at },
  });
  const res = createRes();
  await handler(req, res);
  return res;
}

describe("POST /api/queue/[id]/session-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("stores the end time as a date on the room", async () => {
    const endsAt = Date.now() + 90 * 60 * 1000;
    const res = await post(String(endsAt));

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { sessionEndsAt: new Date(endsAt), lastActivity: expect.any(Date) } }
    );
  });

  it("clears the end time when asked", async () => {
    const res = await post("clear");

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { lastActivity: expect.any(Date) }, $unset: { sessionEndsAt: "" } }
    );
  });

  it("records how far out the end was set, not when", async () => {
    await post(String(Date.now() + 120 * 60 * 1000));

    expect(trackEvent).toHaveBeenCalledWith(
      expect.anything(),
      "session_end_set",
      expect.objectContaining({ roomId: "ROOM1", minutesFromNow: 120 })
    );
  });

  it("rejects a time beyond a day out", async () => {
    const res = await post(String(Date.now() + 48 * 60 * 60 * 1000));

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a time backdated well into the past", async () => {
    const res = await post(String(Date.now() - 60 * 60 * 1000));

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("accepts a just-passed end time so an overrun can still be shown", async () => {
    const res = await post(String(Date.now() - 60 * 1000));

    expect(res.getStatus()).toBe(200);
  });

  it("rejects a non-numeric time", async () => {
    const res = await post("tonight");

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("404s for a room that doesn't exist", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const res = await post(String(Date.now() + 60_000));

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
