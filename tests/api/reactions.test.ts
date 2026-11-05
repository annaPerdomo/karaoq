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

import handler from "../../pages/api/queue/[id]/reactions";

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

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "ROOM1",
    queue: [
      { id: "e1", userName: "Anna & Bo", songTitle: "Song", videoId: "v1", addedAt: 1 },
    ],
    activeVideoIndex: 0,
    isPlaying: true,
    reactionsEnabled: true,
    reactions: [],
    ...overrides,
  };
}

let ip = 0;
async function send(query: Record<string, string>) {
  const req = createMockReq({
    method: "POST",
    query: { id: "ROOM1", emoji: "🔥", reactionId: `r${Math.random()}`, ...query },
    // A fresh IP per test so the shared rate-limit buckets never leak between cases.
    headers: { "x-forwarded-for": `10.0.0.${ip}` },
  });
  const res = createRes();
  await handler(req, res);
  return res;
}

function trackedData() {
  return trackEvent.mock.calls[trackEvent.mock.calls.length - 1][2];
}

beforeEach(() => {
  vi.clearAllMocks();
  ip += 1;
  mockCollection.findOne.mockResolvedValue(room());
  mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
});

describe("POST /api/queue/[id]/reactions", () => {
  it("accepts a cheer with no name, keyed to the browser", async () => {
    const res = await send({ clientId: "client-1" });
    expect(res.getStatus()).toBe(200);
    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$push.reactions.$each[0].userName).toBe("");
    expect(trackedData()).toMatchObject({ userName: "", clientId: "client-1", senderSang: false });
  });

  it("records which surface the cheer was tapped on, dropping unknown values", async () => {
    await send({ source: "welcome" });
    expect(trackedData()).toMatchObject({ cheerSource: "welcome" });
    const res = await send({ source: "somewhere-else" });
    expect(res.getStatus()).toBe(200);
    expect(trackedData().cheerSource).toBeUndefined();
  });

  it("has no per-person cooldown", async () => {
    const stored = { id: "earlier", emoji: "🔥", userName: "Cy", timestamp: Date.now() };
    mockCollection.findOne.mockResolvedValue(room({ reactions: [stored] }));
    const res = await send({ userName: "Cy" });
    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
  });

  it("marks a sender who is on the queue, duet credits included", async () => {
    await send({ userName: "anna" });
    expect(trackedData()).toMatchObject({ senderSang: true });
  });

  it("marks a sender who isn't on the queue", async () => {
    await send({ userName: "Cy" });
    expect(trackedData()).toMatchObject({ senderSang: false });
  });

  it("rejects an oversized clientId", async () => {
    const res = await send({ clientId: "x".repeat(65) });
    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("still refuses when the host has cheers off", async () => {
    mockCollection.findOne.mockResolvedValue(room({ reactionsEnabled: false }));
    const res = await send({});
    expect(res.getStatus()).toBe(403);
  });

  it("caps a single IP's burst", async () => {
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await send({ clientId: "spam" })).getStatus();
    expect(last).toBe(429);
  });
});
