import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { DisplayConfig } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/display-config";

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

const validConfig: DisplayConfig = {
  qrSize: "large",
  showUpNext: true,
  upNextCount: 4,
  showNowPlaying: false,
  showReactions: true,
  theme: "neon",
  welcomeLine: "  Karaoke Tuesdays  ",
  attractMode: true,
};

describe("POST /api/queue/[id]/display-config - Save display config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the trimmed config and bumps lastActivity", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          displayConfig: { ...validConfig, welcomeLine: "Karaoke Tuesdays" },
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("rejects an invalid enum value with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, qrSize: "huge" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an over-long welcomeLine with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, welcomeLine: "x".repeat(81) },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects unknown extra keys with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, extra: "nope" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a non-object body with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: "not-an-object",
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent room", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
