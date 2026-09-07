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

import handler from "../../pages/api/queue/[id]/postpone";

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

function room(ids: string[], activeVideoIndex: number, isPlaying: boolean): Room {
  return {
    id: "ROOM1",
    queue: ids.map((id, i) => ({
      id,
      userName: `Singer ${id}`,
      songTitle: `Song ${id}`,
      videoId: `v${id}`,
      addedAt: 1000 + i,
    })),
    activeVideoIndex,
    isPlaying,
    reactionsEnabled: true,
  };
}

function writtenOrder(): string[] {
  const [, update] = mockCollection.updateOne.mock.calls[0];
  return update.$set.queue.map((e: { id: string }) => e.id);
}

describe("POST /api/queue/[id]/postpone - a singer pushes their own song back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("lets the next two songs go first", async () => {
    // b is up next behind the song on stage; after the move c and d sing before b.
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c", "d", "e"], 0, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after: "2" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(writtenOrder()).toEqual(["a", "c", "d", "b", "e"]);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", queue: expect.any(Array) },
      expect.objectContaining({ $set: expect.objectContaining({ lastActivity: expect.any(Date) }) })
    );
    expect(trackEvent).toHaveBeenCalledWith(req, "song_postponed", {
      roomId: "ROOM1",
      userName: "Singer b",
      postponedBy: 2,
    });
  });

  it("re-stamps the moved song as queued now, so a fair re-sort keeps it back", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c", "d"], 0, true));
    const before = Date.now();
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after: "1" } });
    await handler(req, createRes());

    const [, update] = mockCollection.updateOne.mock.calls[0];
    const moved = update.$set.queue.find((e: { id: string }) => e.id === "b");
    expect(moved.addedAt).toBeGreaterThanOrEqual(before);
  });

  it("moves to the end", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c", "d", "e"], 0, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after: "end" } });
    await handler(req, createRes());

    expect(writtenOrder()).toEqual(["a", "c", "d", "e", "b"]);
    expect(trackEvent).toHaveBeenCalledWith(expect.anything(), "song_postponed", expect.objectContaining({ postponedBy: "end" }));
  });

  it("clamps a long push to the end of the queue", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c"], 0, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after: "10" } });
    await handler(req, createRes());

    expect(writtenOrder()).toEqual(["a", "c", "b"]);
  });

  it("lets the up-next song move while the room is stopped, keeping the index", async () => {
    // Nothing playing: the active slot is merely "up next", and moving it lets
    // the next entry slide into that slot.
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c"], 0, false));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "a", after: "2" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(writtenOrder()).toEqual(["b", "c", "a"]);
    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$set.activeVideoIndex).toBeUndefined();
  });

  it("refuses the song on stage", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c"], 0, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "a", after: "1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("refuses a song already sung", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c"], 2, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "a", after: "1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
  });

  it("is a no-op for the last song in the queue", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b"], 0, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after: "2" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("retries on a queue that changed underneath, then gives up with 409", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b", "c"], 0, true));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after: "1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(3);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("rejects a bad `after`", async () => {
    for (const after of ["0", "-1", "1.5", "x", "51"]) {
      const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "b", after } });
      const res = createRes();
      await handler(req, res);
      expect(res.getStatus(), after).toBe(400);
    }
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing entry", async () => {
    mockCollection.findOne.mockResolvedValue(room(["a", "b"], 0, true));
    const req = createMockReq({ method: "POST", query: { id: "ROOM1", entryId: "zzz", after: "1" } });
    const res = createRes();
    await handler(req, res);
    expect(res.getStatus()).toBe(404);
  });
});
