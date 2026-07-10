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

import handler from "../../pages/api/queue/[id]/display-gone";

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

describe("POST /api/queue/[id]/display-gone - Display teardown", () => {
  beforeEach(() => vi.clearAllMocks());

  it("backdates displayLastSeen so the next host poll sees the display as gone", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({ method: "POST", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    // A stale timestamp (epoch) makes displayConnected compute false at once,
    // rather than waiting out the heartbeat TTL. The filter lets a fresh
    // heartbeat (a second, surviving display) win over the teardown.
    const [filter, update] = mockCollection.updateOne.mock.calls[0];
    expect(filter.id).toBe("ROOM1");
    expect(filter.displayLastSeen.$lt).toBeInstanceOf(Date);
    expect(update).toEqual({ $set: { displayLastSeen: new Date(0) } });
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
