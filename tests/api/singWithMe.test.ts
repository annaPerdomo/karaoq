import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room, SingWithMePost } from "../../pages/api/types";
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

import postHandler from "../../pages/api/queue/[id]/sing-with-me";
import joinHandler from "../../pages/api/queue/[id]/sing-with-me-join";
import removeHandler from "../../pages/api/queue/[id]/sing-with-me-remove";

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
    minSingers: 2,
    maxSingers: 6,
    joinedSingers: ["Anna"],
    queued: false,
    timestamp: 1,
    ...overrides,
  };
}

describe("POST /api/queue/[id]/sing-with-me - create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a post and seeds the creator as first singer", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom());
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        id: "swm-9",
        songTitle: "Shallow",
        videoId: "dQw4w9WgXcQ",
        createdBy: "Anna",
        anonymous: false,
        minSingers: 2,
        maxSingers: 2,
      },
    });
    const res = createRes();
    await postHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const pushed = mockCollection.updateOne.mock.calls[0][1].$push.singWithMe;
    expect(pushed.joinedSingers).toEqual(["Anna"]);
    expect(pushed.queued).toBe(false);
  });

  it("drops the creator name when anonymous", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom());
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        id: "swm-9",
        songTitle: "Shallow",
        videoId: "dQw4w9WgXcQ",
        createdBy: "Anna",
        anonymous: true,
        minSingers: 2,
        maxSingers: 2,
      },
    });
    const res = createRes();
    await postHandler(req, res);

    const pushed = mockCollection.updateOne.mock.calls[0][1].$push.singWithMe;
    expect(pushed.createdBy).toBe("");
    expect(pushed.joinedSingers).toEqual([]);
  });

  it("rejects minSingers below 2", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        id: "swm-9",
        songTitle: "Solo",
        videoId: "dQw4w9WgXcQ",
        createdBy: "Anna",
        anonymous: false,
        minSingers: 1,
        maxSingers: 1,
      },
    });
    const res = createRes();
    await postHandler(req, res);
    expect(res.getStatus()).toBe(400);
  });
});

describe("POST /api/queue/[id]/sing-with-me-join", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auto-adds to the queue when the minimum is reached, keeping the post open for more", async () => {
    // Pre-read, then the fresh re-read after the atomic join landed.
    mockCollection.findOne
      .mockResolvedValueOnce(baseRoom({ singWithMe: [post()] }))
      .mockResolvedValueOnce(baseRoom({ singWithMe: [post({ joinedSingers: ["Anna", "Bob"] })] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Bob" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(200);
    // Step 1: positional $push of the name, guarded against dupes/overflow.
    const [joinFilter, joinUpdate] = mockCollection.updateOne.mock.calls[0];
    expect(joinFilter.singWithMe.$elemMatch.joinedSingers).toEqual({ $ne: "Bob" });
    expect(joinUpdate.$push["singWithMe.$.joinedSingers"]).toBe("Bob");
    // Step 2: minimum reached → one guarded write queues the song.
    const [queueFilter, queueUpdate] = mockCollection.updateOne.mock.calls[1];
    expect(queueFilter.singWithMe.$elemMatch.queued).toEqual({ $ne: true });
    expect(queueUpdate.$push.queue.userName).toBe("Anna & Bob");
    expect(queueUpdate.$push.queue.videoId).toBe("dQw4w9WgXcQ");
    expect(queueUpdate.$set["singWithMe.$.queued"]).toBe(true);
    // Still room (max 6) so it stays on the board — no $pull call.
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
    expect((res.getBody() as { queued: boolean }).queued).toBe(true);
  });

  it("does not re-queue once already queued, but still adds the singer", async () => {
    const queuedPost = post({ joinedSingers: ["Anna", "Bob"], queued: true });
    mockCollection.findOne
      .mockResolvedValueOnce(baseRoom({ singWithMe: [queuedPost] }))
      .mockResolvedValueOnce(
        baseRoom({ singWithMe: [post({ joinedSingers: ["Anna", "Bob", "Cara"], queued: true })] })
      );
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Cara" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(200);
    // Only the join write — no second queueing write, no board $pull.
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
    expect(mockCollection.updateOne.mock.calls[0][1].$push["singWithMe.$.joinedSingers"]).toBe("Cara");
    expect((res.getBody() as { queued: boolean }).queued).toBe(true);
  });

  it("drops the post from the board once it fills up", async () => {
    // min 2 / max 2: the join that hits the minimum also fills it, so the song
    // queues and the (now spent) post leaves the board.
    mockCollection.findOne
      .mockResolvedValueOnce(baseRoom({ singWithMe: [post({ maxSingers: 2 })] }))
      .mockResolvedValueOnce(
        baseRoom({ singWithMe: [post({ maxSingers: 2, joinedSingers: ["Anna", "Bob"] })] })
      );
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Bob" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(3);
    expect(mockCollection.updateOne.mock.calls[1][1].$push.queue.userName).toBe("Anna & Bob");
    expect(mockCollection.updateOne.mock.calls[2][1].$pull).toEqual({
      singWithMe: { id: "swm-1", queued: true },
    });
  });

  it("retries queueing on a later join when the crossing join missed its moment", async () => {
    // The post reached its minimum earlier but never queued (e.g. the queue
    // was full right then). The next join must pick it up instead of leaving
    // the post dead on the board forever.
    mockCollection.findOne
      .mockResolvedValueOnce(baseRoom({ singWithMe: [post({ joinedSingers: ["Anna", "Bob"] })] }))
      .mockResolvedValueOnce(
        baseRoom({ singWithMe: [post({ joinedSingers: ["Anna", "Bob", "Cara"] })] })
      );
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Cara" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const queueUpdate = mockCollection.updateOne.mock.calls[1][1];
    expect(queueUpdate.$push.queue.userName).toBe("Anna & Bob & Cara");
    expect(queueUpdate.$set["singWithMe.$.queued"]).toBe(true);
    expect((res.getBody() as { queued: boolean }).queued).toBe(true);
  });

  it("409s when the same name landed concurrently (atomic guard)", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    // The snapshot looked fine, but the guarded write matched nothing — the
    // name was added (or the post filled) in the race window.
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Bob" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects joining when full", async () => {
    mockCollection.findOne.mockResolvedValue(
      baseRoom({ singWithMe: [post({ joinedSingers: ["Anna", "Bob"], maxSingers: 2, queued: true })] })
    );
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Cara" },
    });
    const res = createRes();
    await joinHandler(req, res);
    expect(res.getStatus()).toBe(409);
  });

  it("rejects a duplicate join", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Anna" },
    });
    const res = createRes();
    await joinHandler(req, res);
    expect(res.getStatus()).toBe(409);
  });
});

describe("POST /api/queue/[id]/sing-with-me-remove", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the poster remove their own post", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", postId: "swm-1", userName: "Anna" },
    });
    const res = createRes();
    await removeHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne.mock.calls[0][1].$pull).toEqual({
      singWithMe: { id: "swm-1" },
    });
  });

  it("blocks someone else from removing a post", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", postId: "swm-1", userName: "Mallory" },
    });
    const res = createRes();
    await removeHandler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("lets host moderation remove without a name", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", postId: "swm-1" },
    });
    const res = createRes();
    await removeHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne.mock.calls[0][1].$pull).toEqual({
      singWithMe: { id: "swm-1" },
    });
  });
});
