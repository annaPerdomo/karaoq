import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockInsertOne = vi.fn();
const mockCreateIndex = vi.fn().mockResolvedValue({});

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({
          insertOne: mockInsertOne,
          createIndex: mockCreateIndex,
        }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/analytics/error";

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

describe("POST /api/analytics/error", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a valid report with request metadata", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({
      method: "POST",
      headers: {
        host: "karaoq.live",
        "user-agent": "test-agent",
        "x-vercel-ip-country": "US",
        // Distinct IPs per test so the shared in-memory rate limiter can't
        // carry a spent bucket across tests.
        "x-forwarded-for": "10.1.0.1",
      },
      body: {
        message: "TypeError: boom",
        stack: "TypeError: boom\n  at x",
        source: "promise",
        page: "/host/ABCD",
        roomId: "ABCD",
      },
    });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockInsertOne).toHaveBeenCalledOnce();
    const doc = mockInsertOne.mock.calls[0][0];
    expect(doc.message).toBe("TypeError: boom");
    expect(doc.source).toBe("promise");
    expect(doc.roomId).toBe("ABCD");
    expect(doc.userAgent).toBe("test-agent");
    expect(doc.country).toBe("US");
    expect(doc.timestamp).toBeInstanceOf(Date);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createRes();
    await handler(req, res);
    expect(res.getStatus()).toBe(405);
  });

  it("rejects a report with no message", async () => {
    const req = createMockReq({
      method: "POST",
      headers: { host: "karaoq.live", "x-forwarded-for": "10.1.0.2" },
      body: { source: "window" },
    });
    const res = createRes();
    await handler(req, res);
    expect(res.getStatus()).toBe(400);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("accepts but does not store exempt (demo/localhost) traffic", async () => {
    const req = createMockReq({
      method: "POST",
      headers: {
        host: "karaoq.live",
        "x-karaoq-demo": "1",
        "x-forwarded-for": "10.1.0.3",
      },
      body: { message: "boom" },
    });
    const res = createRes();
    await handler(req, res);
    expect(res.getStatus()).toBe(200);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("rate limits a flood from one address", async () => {
    mockInsertOne.mockResolvedValue({});
    const headers = { host: "karaoq.live", "x-forwarded-for": "10.1.0.4" };
    for (let i = 0; i < 10; i++) {
      const res = createRes();
      await handler(
        createMockReq({ method: "POST", headers, body: { message: `e${i}` } }),
        res
      );
      expect(res.getStatus()).toBe(200);
    }
    const res = createRes();
    await handler(
      createMockReq({ method: "POST", headers, body: { message: "e11" } }),
      res
    );
    expect(res.getStatus()).toBe(429);
    expect(mockInsertOne).toHaveBeenCalledTimes(10);
  });

  it("still returns 200 when the database write fails", async () => {
    mockInsertOne.mockRejectedValue(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = createMockReq({
      method: "POST",
      headers: { host: "karaoq.live", "x-forwarded-for": "10.1.0.5" },
      body: { message: "boom" },
    });
    const res = createRes();
    await handler(req, res);
    expect(res.getStatus()).toBe(200);
    consoleSpy.mockRestore();
  });
});
