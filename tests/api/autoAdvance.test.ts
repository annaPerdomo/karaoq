import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/auto-advance";

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

const ROOM: Room = {
  id: "ROOM1",
  queue: [],
  activeVideoIndex: 0,
  isPlaying: false,
  reactionsEnabled: true,
};

describe("POST /api/queue/[id]/auto-advance - the room's auto-advance setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("turns auto-advance on with the defaults filled in", async () => {
    mockCollection.findOne.mockResolvedValue(ROOM);
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { enabled: true },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const expected = { enabled: true, gapSeconds: 10 };
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { autoAdvance: expected, lastActivity: expect.any(Date) } }
    );
    expect(trackEvent).toHaveBeenCalledWith(req, "auto_advance_set", {
      roomId: "ROOM1",
      autoAdvance: expected,
    });
    expect((res.getBody() as { autoAdvance: unknown }).autoAdvance).toEqual(expected);
  });

  it("leaves a room that predates the setting off when only the gap is patched", async () => {
    // ROOM has no stored autoAdvance. Turning chaining on for a night already
    // in progress has to be an explicit act, not a side effect of a gap tap.
    mockCollection.findOne.mockResolvedValue(ROOM);
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { gapSeconds: 20 },
    });
    await handler(req, createRes());

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          autoAdvance: { enabled: false, gapSeconds: 20 },
          lastActivity: expect.any(Date),
        },
        $unset: { autoStartAt: "" },
      }
    );
  });

  it("patches one field and keeps the rest of the stored setting", async () => {
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      autoAdvance: { enabled: true, gapSeconds: 30 },
    });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { gapSeconds: 5 },
    });
    await handler(req, createRes());

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          autoAdvance: { enabled: true, gapSeconds: 5 },
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("snaps a gap outside the accepted range back to the default", async () => {
    // A hand-crafted request must not park a room on a 0s gap.
    mockCollection.findOne.mockResolvedValue(ROOM);
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { enabled: true, gapSeconds: 0, bogus: 1 },
    });
    await handler(req, createRes());

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          autoAdvance: { enabled: true, gapSeconds: 10 },
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("drops a pending countdown when switching auto-advance off", async () => {
    // A display mid-countdown must not start a song under a setting the host
    // just turned off.
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      autoAdvance: { enabled: true, gapSeconds: 10 },
      autoStartAt: new Date(),
    });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { enabled: false },
    });
    await handler(req, createRes());

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          autoAdvance: { enabled: false, gapSeconds: 10 },
          lastActivity: expect.any(Date),
        },
        $unset: { autoStartAt: "" },
      }
    );
  });

  it("cancels a pending countdown without touching the setting", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", cancel: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.findOne).not.toHaveBeenCalled();
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $unset: { autoStartAt: "" }, $set: { lastActivity: expect.any(Date) } }
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("re-times a lapsed countdown for a surface that landed between songs", async () => {
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      autoAdvance: { enabled: true, gapSeconds: 20 },
    });
    const before = Date.now();
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", arm: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const [filter, update] = mockCollection.updateOne.mock.calls[0];
    expect(filter["autoAdvance.enabled"]).toBe(true);
    expect(filter.isPlaying).toEqual({ $ne: true });
    const lapsedBefore: Date = filter.autoStartAt.$lt;
    expect(lapsedBefore.getTime()).toBeGreaterThanOrEqual(before - 30_000);
    expect(lapsedBefore.getTime()).toBeLessThanOrEqual(Date.now() - 30_000);
    expect(filter.$and).toHaveLength(2);
    const at = update.$set.autoStartAt.getTime();
    expect(at).toBeGreaterThanOrEqual(before + 20_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 20_000);
    expect((res.getBody() as { autoStartAt: string }).autoStartAt).toBe(
      update.$set.autoStartAt.toISOString()
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("reports nothing armed when the room did not match", async () => {
    mockCollection.findOne.mockResolvedValue(ROOM);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", arm: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as { autoStartAt: unknown }).autoStartAt).toBeNull();
  });

  it("rejects a non-object body", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: "true",
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a room that does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);
    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE" },
      body: { enabled: true },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects non-POST", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);
    expect(res.getStatus()).toBe(405);
  });

  it("re-times a running countdown when the gap changes", async () => {
    // The breather began 4s ago under a 10s gap; switching to 30s should
    // leave 26s, not restart at 30 or keep the old 6.
    const began = Date.now() - 4000;
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      autoAdvance: { enabled: true, gapSeconds: 10 },
      autoStartAt: new Date(began + 10_000),
    });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { gapSeconds: 30 },
    });
    await handler(req, createRes());

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set.autoAdvance).toEqual({ enabled: true, gapSeconds: 30 });
    expect(update.$set.autoStartAt.getTime()).toBe(began + 30_000);
  });

  it("arms a countdown when switched on between songs", async () => {
    const before = Date.now();
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      queue: [
        { id: "a", userName: "A", songTitle: "Sung", videoId: "v1" },
        { id: "b", userName: "B", songTitle: "Waiting", videoId: "v2" },
      ],
      activeVideoIndex: 1,
      isPlaying: false,
      autoAdvance: { enabled: false, gapSeconds: 10 },
    });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { enabled: true },
    });
    await handler(req, createRes());

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set.autoAdvance).toEqual({ enabled: true, gapSeconds: 10 });
    const at = update.$set.autoStartAt.getTime();
    expect(at).toBeGreaterThanOrEqual(before + 10_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 10_000);
  });

  it.each([
    ["the room is still playing", { activeVideoIndex: 1, isPlaying: true }],
    ["no song has been sung yet", { activeVideoIndex: 0, isPlaying: false }],
    ["the queue has run out", { activeVideoIndex: 2, isPlaying: false }],
  ])("does not arm a countdown on switch-on when %s", async (_label, state) => {
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      queue: [
        { id: "a", userName: "A", songTitle: "One", videoId: "v1" },
        { id: "b", userName: "B", songTitle: "Two", videoId: "v2" },
      ],
      ...state,
      autoAdvance: { enabled: false, gapSeconds: 10 },
    });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { enabled: true },
    });
    await handler(req, createRes());

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set.autoStartAt).toBeUndefined();
  });

  it("leaves a running countdown alone when only unrelated fields change", async () => {
    mockCollection.findOne.mockResolvedValue({
      ...ROOM,
      autoAdvance: { enabled: true, gapSeconds: 10 },
      autoStartAt: new Date(Date.now() + 5000),
    });
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { enabled: true },
    });
    await handler(req, createRes());

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set.autoStartAt).toBeUndefined();
    expect(update.$unset).toBeUndefined();
  });
});
