import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room, SingWithMePost, SuggestedSong } from "../../pages/api/types";
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

import swmEditHandler from "../../pages/api/queue/[id]/sing-with-me-edit";
import suggestionEditHandler from "../../pages/api/queue/[id]/suggestions-edit";

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

function post(overrides: Partial<SingWithMePost> = {}): SingWithMePost {
  return {
    id: "swm-1",
    songTitle: "One Day More",
    videoId: "dQw4w9WgXcQ",
    createdBy: "Anna",
    anonymous: false,
    minSingers: 4,
    maxSingers: 6,
    joinedSingers: ["Anna", "Bo"],
    queued: false,
    timestamp: 1,
    ...overrides,
  };
}

function suggestion(overrides: Partial<SuggestedSong> = {}): SuggestedSong {
  return {
    id: "sug-1",
    songTitle: "Sweet Caroline",
    videoId: "dQw4w9WgXcQ",
    suggestedBy: "Anna",
    anonymous: false,
    timestamp: 1,
    ...overrides,
  };
}

const NEW_SONG = { songTitle: "One Day More (Karaoke)", videoId: "aBcDeFgHiJk" };

describe("POST /api/queue/[id]/sing-with-me-edit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the song and singer counts on an open post", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 3, maxSingers: 5 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", singWithMe: { $elemMatch: { id: "swm-1", queued: { $ne: true } } } },
      {
        $set: {
          "singWithMe.$.songTitle": NEW_SONG.songTitle,
          "singWithMe.$.videoId": NEW_SONG.videoId,
          "singWithMe.$.minSingers": 3,
          "singWithMe.$.maxSingers": 5,
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("auto-queues when the host lowers the minimum to the singers already joined", async () => {
    // 2 joined, minimum drops 4 → 2: the post is now ready and must queue,
    // exactly as a join crossing the threshold would.
    const edited = post({ minSingers: 2 });
    mockCollection.findOne
      .mockResolvedValueOnce(baseRoom({ singWithMe: [post()] })) // pre-edit read
      .mockResolvedValueOnce(baseRoom({ singWithMe: [edited] })); // re-read in queueSingWithMeIfReady
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", songTitle: "One Day More", videoId: "dQw4w9WgXcQ", minSingers: 2, maxSingers: 6 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as { queued: boolean }).queued).toBe(true);
    const queueWrite = mockCollection.updateOne.mock.calls.find(
      ([, update]) => (update as { $push?: unknown }).$push
    );
    expect(queueWrite).toBeDefined();
    const pushed = (queueWrite![1] as { $push: { queue: { userName: string; songTitle: string } } }).$push.queue;
    expect(pushed.userName).toBe("Anna & Bo");
    expect(pushed.songTitle).toBe("🎤 One Day More");
  });

  it("lets the poster edit their own post", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 4, maxSingers: 6, userName: "Anna" },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(200);
  });

  it("blocks someone else from editing a post", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 4, maxSingers: 6, userName: "Mallory" },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("refuses to edit a post that is already queued", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post({ queued: true })] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 4, maxSingers: 6 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("refuses a max below the singers already joined", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] })); // 2 joined

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 2, maxSingers: 1 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an edit the create route would have rejected (minSingers below 2)", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 1, maxSingers: 6 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a bad video id", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", songTitle: "Fine", videoId: "nope!", minSingers: 2, maxSingers: 6 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("409s when a concurrent join queued the post between the read and the write", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 }); // queued guard lost

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", ...NEW_SONG, minSingers: 4, maxSingers: 6 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(409);
  });

  it("404s for a missing post", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "nope", ...NEW_SONG, minSingers: 2, maxSingers: 6 },
    });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await swmEditHandler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});

describe("POST /api/queue/[id]/suggestions-edit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("swaps the requested song", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", ...NEW_SONG },
    });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", "suggestions.id": "sug-1" },
      {
        $set: {
          "suggestions.$.songTitle": NEW_SONG.songTitle,
          "suggestions.$.videoId": NEW_SONG.videoId,
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("keeps the requester's identity when a host edits their request", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      // A host trying to rewrite who asked for it: the fields are ignored.
      body: { suggestionId: "sug-1", ...NEW_SONG, suggestedBy: "Mallory", anonymous: true },
    });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update).toEqual({
      $set: {
        "suggestions.$.songTitle": NEW_SONG.songTitle,
        "suggestions.$.videoId": NEW_SONG.videoId,
        lastActivity: expect.any(Date),
      },
    });
  });

  it("blocks someone else from editing a request", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion()] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", ...NEW_SONG, userName: "Mallory" },
    });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("lets the requester edit their own request", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", ...NEW_SONG, userName: "Anna" },
    });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(200);
  });

  it("404s when the request was claimed between the read and the write", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", ...NEW_SONG },
    });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects a bad video id", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ suggestions: [suggestion()] }));

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { suggestionId: "sug-1", songTitle: "Fine", videoId: "short" },
    });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await suggestionEditHandler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
