import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/play";

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

describe("POST /api/queue/[id]/play - Set play state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets isPlaying to true on a surface-less start", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", isPlaying: { $ne: true } },
      {
        $set: { isPlaying: true, playStartedAt: expect.any(Date), lastActivity: expect.any(Date) },
        $unset: { displayPaused: "", playPausedAt: "" },
      }
    );
  });

  it("accepts a tokenless start on a here-mode room", async () => {
    // The co-host's Play: no surface is claimed here, the host page claims it on
    // its next poll, and the room GET heals the start if none ever does.
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false, playMode: "here" };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ROOM1" }),
      expect.objectContaining({
        $set: expect.objectContaining({ isPlaying: true }),
      })
    );
  });

  it("never clears playToken on a tokenless start", async () => {
    // Load-bearing: the room GET treats a here-mode room playing WITHOUT a token
    // as orphaned. Unsetting it here would orphan a running song and the heal
    // would cut it mid-performance.
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false, playMode: "here" };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true" },
    });
    const res = createRes();
    await handler(req, res);

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$unset).not.toHaveProperty("playToken");
    expect(update.$set).not.toHaveProperty("playToken");
  });

  it("no-ops a stale co-host Play on an already-playing room", async () => {
    // A co-host's view can be a poll stale (queue edits hold polling). Re-landing
    // the start mid-song would rewrite playStartedAt and jump every phone's ETA
    // back to a full song.
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: true, playMode: "here" };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", isPlaying: { $ne: true } },
      expect.anything()
    );
  });

  it("compare-and-sets a claim so only one host page wins", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: true, playMode: "here" };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true", playToken: "tab-a", claim: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", isPlaying: true, playToken: { $exists: false } },
      expect.objectContaining({
        $set: expect.objectContaining({ playToken: "tab-a" }),
      })
    );
  });

  it("rejects a claim that lost the race, so the loser yields", async () => {
    // Two visible host tabs both see the tokenless start. Without this, both
    // mount a player and the same song plays out of sync on two screens.
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: true, playMode: "here" };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true", playToken: "tab-b", claim: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
  });

  it("lets a deliberate host start take over unconditionally", async () => {
    // Not a claim: pressing Play on a host screen is an explicit takeover and
    // must beat whatever token another device holds.
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: true, playToken: "other" };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true", playToken: "mine" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      expect.objectContaining({
        $set: expect.objectContaining({ playToken: "mine" }),
      })
    );
  });

  it("sets isPlaying to false for any value other than 'true'", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: true };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "false" },
    });
    const res = createRes();
    await handler(req, res);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: { isPlaying: false, lastActivity: expect.any(Date) },
        $unset: {
          playToken: "",
          displayPaused: "",
          playStartedAt: "",
          playPausedAt: "",
        },
      }
    );
  });

  it("records the playback token when starting with one", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", isPlaying: "true", playToken: "tok-abc" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: { isPlaying: true, playToken: "tok-abc", playStartedAt: expect.any(Date), lastActivity: expect.any(Date) },
        $unset: { displayPaused: "", playPausedAt: "" },
      }
    );
  });

  it("returns 404 when room does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1", isPlaying: "true" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });
});
