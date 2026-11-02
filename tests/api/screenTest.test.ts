import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  countDocuments: vi.fn(),
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

import handler from "../../pages/api/queue/[id]/screen-test";
import { __resetRateLimits } from "../../lib/limits";

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

describe("POST /api/queue/[id]/screen-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
  });

  it("stamps screenTestAt and wakes the room, at most once every few seconds", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = createRes();
    await handler(createMockReq({ method: "POST", query: { id: "ROOM1" } }), res);

    expect(res.getStatus()).toBe(200);
    const [filter, update] = mockCollection.updateOne.mock.calls[0];
    expect(filter.id).toBe("ROOM1");
    expect(filter.$or[1].screenTestAt.$lt).toBeInstanceOf(Date);
    expect(update).toEqual({ $set: { screenTestAt: expect.any(Date), lastActivity: expect.any(Date) } });
  });

  it("answers 200 without writing again while the last card is still up", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    mockCollection.countDocuments.mockResolvedValue(1);
    const res = createRes();
    await handler(createMockReq({ method: "POST", query: { id: "ROOM1" } }), res);
    expect(res.getStatus()).toBe(200);
  });

  it("returns 404 for a missing room", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    mockCollection.countDocuments.mockResolvedValue(0);
    const res = createRes();
    await handler(createMockReq({ method: "POST", query: { id: "NOPE1" } }), res);
    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { id: "ROOM1" } }), res);
    expect(res.getStatus()).toBe(405);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });
});
