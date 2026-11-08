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
process.env.ANALYTICS_SECRET = "s3cret";

import handler, { ADMIN_CHEER_NAME } from "../../pages/api/analytics/cheer";

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

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: "ROOM1",
    queue: [{ id: "e1", userName: "Mesa 5", songTitle: "Song", videoId: "v1" }],
    activeVideoIndex: 0,
    isPlaying: true,
    reactionsEnabled: true,
    reactions: [],
    ...overrides,
  };
}

async function post(body: unknown, secret: string | null = "s3cret") {
  const res = createRes();
  await handler(
    createMockReq({
      method: "POST",
      headers: secret ? { "x-analytics-secret": secret } : {},
      body,
    }),
    res
  );
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.findOne.mockResolvedValue(room());
  mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
});

describe("POST /api/analytics/cheer — a cheer from Mission Control", () => {
  it("pushes the cheer under the KaraoQ name and keeps it out of the audience's cheer counts", async () => {
    const res = await post({ roomId: "room1", emoji: "🔥" });

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $push: {
          reactions: {
            $each: [expect.objectContaining({ emoji: "🔥", userName: ADMIN_CHEER_NAME })],
            $slice: -50,
          },
        },
        $set: { lastActivity: expect.any(Date) },
      }
    );
    expect(trackEvent).toHaveBeenCalledWith(expect.anything(), "admin_cheer_sent", {
      roomId: "ROOM1",
      emoji: "🔥",
    });
    expect(trackEvent).not.toHaveBeenCalledWith(expect.anything(), "reaction_sent", expect.anything());
  });

  it("refuses without the admin secret", async () => {
    expect((await post({ roomId: "ROOM1", emoji: "🔥" }, null)).getStatus()).toBe(401);
    expect((await post({ roomId: "ROOM1", emoji: "🔥" }, "nope")).getStatus()).toBe(401);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("only cheers a room with a song on stage", async () => {
    mockCollection.findOne.mockResolvedValue(room({ isPlaying: false }));
    expect((await post({ roomId: "ROOM1", emoji: "🔥" })).getStatus()).toBe(409);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("respects a host who turned cheers off", async () => {
    mockCollection.findOne.mockResolvedValue(room({ reactionsEnabled: false }));
    expect((await post({ roomId: "ROOM1", emoji: "🔥" })).getStatus()).toBe(403);
  });

  it("rejects an emoji outside the cheer set, a bad room code and a missing room", async () => {
    expect((await post({ roomId: "ROOM1", emoji: "💩" })).getStatus()).toBe(400);
    expect((await post({ roomId: "not a code!", emoji: "🔥" })).getStatus()).toBe(400);
    mockCollection.findOne.mockResolvedValue(null);
    expect((await post({ roomId: "ROOM1", emoji: "🔥" })).getStatus()).toBe(404);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });
});
