import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { __resetRateLimits } from "../../lib/limits";

const mockInsertOne = vi.fn();

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({ insertOne: mockInsertOne }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/analytics/screen-help";

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

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";

function post(body: unknown, userAgent = IPHONE_UA) {
  return createMockReq({
    method: "POST",
    headers: { host: "karaoq.live", "user-agent": userAgent },
    body,
  });
}

describe("POST /api/analytics/screen-help", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertOne.mockResolvedValue({});
    __resetRateLimits();
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });

  it("rejects a missing roomId with 400", async () => {
    const req = post({});
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects a malformed roomId with 400", async () => {
    const req = post({ roomId: "not a code!" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects an over-long roomId with 400", async () => {
    const req = post({ roomId: "A".repeat(13) });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects an unknown option with 400", async () => {
    const req = post({ roomId: "room1", option: "teleport" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects a device key in the body with 400", async () => {
    const req = post({ roomId: "room1", device: "mobile" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("stores screen_help_opened when no option is given, roomId uppercased, device from the UA, with a ~90-day expiresAt", async () => {
    const req = post({ roomId: "room1" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ ok: true });
    expect(mockInsertOne).toHaveBeenCalledOnce();
    const event = mockInsertOne.mock.calls[0][0];
    expect(event.type).toBe("screen_help_opened");
    expect(event.roomId).toBe("ROOM1");
    expect(event.device).toBe("mobile");
    expect(event.option).toBeUndefined();
    const ttl = event.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(89 * 24 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(90 * 24 * 3600_000);
  });

  it("stores screen_help_option with the option in data", async () => {
    const req = post({ roomId: "room1", option: "pair" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockInsertOne).toHaveBeenCalledOnce();
    const event = mockInsertOne.mock.calls[0][0];
    expect(event.type).toBe("screen_help_option");
    expect(event.roomId).toBe("ROOM1");
    expect(event.device).toBe("mobile");
    expect(event.option).toBe("pair");
  });

  it("stores screen_help_step with where the host got stuck", async () => {
    const res = createRes();
    await handler(post({ roomId: "room1", option: "popout", method: "cable", step: "drag", outcome: "stuck" }), res);

    expect(res.getStatus()).toBe(200);
    const event = mockInsertOne.mock.calls[0][0];
    expect(event.type).toBe("screen_help_step");
    expect(event).toMatchObject({ roomId: "ROOM1", option: "popout", method: "cable", step: "drag", outcome: "stuck" });
  });

  it("accepts the quick check's verdict without a method", async () => {
    const res = createRes();
    await handler(post({ roomId: "room1", option: "quickCheck", step: "verify", outcome: "verified" }), res);
    expect(res.getStatus()).toBe(200);
    expect(mockInsertOne.mock.calls[0][0].method).toBeUndefined();
  });

  it.each([
    [{ option: "popout", step: "drag", outcome: "gave up" }],
    [{ option: "popout", step: "Drag!", outcome: "stuck" }],
    [{ option: "popout", method: "carrier pigeon", step: "drag", outcome: "stuck" }],
    [{ step: "drag", outcome: "stuck" }],
    [{ option: "quickCheck" }],
    [{ option: "pair", method: "cable" }],
  ])("rejects a malformed step event %o", async (extra) => {
    const res = createRes();
    await handler(post({ roomId: "room1", ...extra }), res);
    expect(res.getStatus()).toBe(400);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("rate limits after too many requests", async () => {
    for (let i = 0; i < 20; i++) {
      await handler(post({ roomId: "ROOM1" }), createRes());
    }
    const res = createRes();
    await handler(post({ roomId: "ROOM1" }), res);

    expect(res.getStatus()).toBe(429);
  });
});
