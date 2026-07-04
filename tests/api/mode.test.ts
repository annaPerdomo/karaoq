import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
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

import handler from "../../pages/api/queue/[id]/mode";

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

describe("POST /api/queue/[id]/mode - Set play mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores tv mode on the room", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", playMode: "tv" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { playMode: "tv", lastActivity: expect.any(Date) } }
    );
  });

  it("stores here mode on the room", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", playMode: "here" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { playMode: "here", lastActivity: expect.any(Date) } }
    );
  });

  it("rejects unknown modes with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", playMode: "chromecast" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for non-existent room", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", playMode: "tv" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1", playMode: "tv" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
