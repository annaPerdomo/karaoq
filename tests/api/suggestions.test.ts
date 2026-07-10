import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room, SuggestedSong } from "../../pages/api/types";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  insertOne: vi.fn(),
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

import postHandler from "../../pages/api/queue/[id]/suggestions";
import claimHandler from "../../pages/api/queue/[id]/suggestions-claim";
import removeHandler from "../../pages/api/queue/[id]/suggestions-remove";

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

function baseRoom(overrides: Partial<Room> = {}): Room {
  return { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false, ...overrides };
}

const suggestion: SuggestedSong = {
  id: "sug-1",
  songTitle: "Africa",
  videoId: "dQw4w9WgXcQ",
  suggestedBy: "",
  anonymous: true,
  timestamp: 1,
};

describe("POST /api/queue/[id]/suggestions - create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suggests a song anonymously", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom());
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        id: "sug-9",
        songTitle: "Africa",
        videoId: "dQw4w9WgXcQ",
        suggestedBy: "Anna",
        anonymous: true,
      },
    });
    const res = createRes();
    await postHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const pushed = mockCollection.updateOne.mock.calls[0][1].$push.suggestions;
    expect(pushed.suggestedBy).toBe("");
    expect(pushed.anonymous).toBe(true);
  });
});

describe("POST /api/queue/[id]/suggestions-claim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues the song under the claimer and clears it from the board", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", userName: "Bob" },
    });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(200);
    // One atomic write: pull from the board + push onto the queue, guarded
    // by the suggestion still being present at write time.
    const [filter, update] = mockCollection.updateOne.mock.calls[0];
    expect(filter["suggestions.id"]).toBe("sug-1");
    expect(update.$pull).toEqual({ suggestions: { id: "sug-1" } });
    expect(update.$push.queue.userName).toBe("Bob");
    expect(update.$push.queue.songTitle).toBe("Africa");
  });

  it("409s the second of two concurrent claims instead of double-queueing", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion] }));
    // The other claimer's $pull already removed it, so this write matches nothing.
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", userName: "Cara" },
    });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown suggestion", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion] }));
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "nope", userName: "Bob" },
    });
    const res = createRes();
    await claimHandler(req, res);
    expect(res.getStatus()).toBe(404);
  });
});

describe("POST /api/queue/[id]/suggestions-remove", () => {
  beforeEach(() => vi.clearAllMocks());

  const named: SuggestedSong = { ...suggestion, id: "sug-2", suggestedBy: "Anna", anonymous: false };

  it("lets the suggester withdraw their own suggestion", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [named] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", suggestionId: "sug-2", userName: "Anna" },
    });
    const res = createRes();
    await removeHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne.mock.calls[0][1].$pull).toEqual({
      suggestions: { id: "sug-2" },
    });
  });

  it("blocks someone else from removing a suggestion", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [named] }));
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", suggestionId: "sug-2", userName: "Mallory" },
    });
    const res = createRes();
    await removeHandler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("lets host moderation remove without a name", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [named] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", suggestionId: "sug-2" },
    });
    const res = createRes();
    await removeHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne.mock.calls[0][1].$pull).toEqual({
      suggestions: { id: "sug-2" },
    });
  });
});
