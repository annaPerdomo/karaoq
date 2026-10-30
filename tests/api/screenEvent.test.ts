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

import handler from "../../pages/api/analytics/screen-event";

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

function post(body: unknown) {
  return createMockReq({
    method: "POST",
    headers: { host: "karaoq.live" },
    body,
  });
}

describe("POST /api/analytics/screen-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertOne.mockResolvedValue({});
    __resetRateLimits();
  });

  const cases: Array<[string, Record<string, unknown>]> = [
    ["music_video_screen_opened", {}],
    ["music_video_screen_closed", { durationSeconds: 120, songsShown: 3, songsUnavailable: 1 }],
    ["music_video_error", { code: 150 }],
    ["music_video_offset", { offsetSeconds: -1.5 }],
    ["music_video_link", { action: "open" }],
    ["logo_upload_rejected", { reason: "size" }],
  ];

  it.each(cases)("accepts a valid %s event", async (type, data) => {
    const req = post({ roomId: "ROOM1", type, data });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockInsertOne).toHaveBeenCalledOnce();
    const event = mockInsertOne.mock.calls[0][0];
    expect(event.type).toBe(type);
    expect(event.roomId).toBe("ROOM1");
  });

  it("rejects an unknown type with 400", async () => {
    const req = post({ roomId: "ROOM1", type: "not_a_real_type", data: {} });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("rejects extra keys in data with 400", async () => {
    const req = post({ roomId: "ROOM1", type: "music_video_link", data: { action: "open", extra: 1 } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects an out-of-range value with 400", async () => {
    const req = post({ roomId: "ROOM1", type: "music_video_error", data: { code: 1000 } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("accepts any plausible IFrame error code, not just the old fixed set", async () => {
    const req = post({ roomId: "ROOM1", type: "music_video_error", data: { code: 999 } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
  });

  it("rejects a missing roomId with 400", async () => {
    const req = post({ type: "music_video_screen_opened", data: {} });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects a malformed roomId with 400", async () => {
    const req = post({ roomId: "not a code!", type: "music_video_screen_opened", data: {} });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "rejects the prototype-inherited type %s with 400",
    async (type) => {
      const req = post({ roomId: "ROOM1", type, data: {} });
      const res = createRes();
      await handler(req, res);

      expect(res.getStatus()).toBe(400);
      expect(mockInsertOne).not.toHaveBeenCalled();
    }
  );

  it("rejects data carrying type/roomId/timestamp as unknown keys, and they can never override the stored event", async () => {
    const req = post({
      roomId: "ROOM1",
      type: "music_video_link",
      data: { action: "open", type: "room_created", roomId: "OTHER1", timestamp: "2000-01-01", free: "text" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });

  it("rate limits after too many requests", async () => {
    for (let i = 0; i < 60; i++) {
      await handler(post({ roomId: "ROOM1", type: "music_video_link", data: { action: "open" } }), createRes());
    }
    const res = createRes();
    await handler(post({ roomId: "ROOM1", type: "music_video_link", data: { action: "open" } }), res);

    expect(res.getStatus()).toBe(429);
  });
});
