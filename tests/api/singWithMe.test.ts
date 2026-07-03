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
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

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
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

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

  it("auto-adds to the queue when the minimum is reached", async () => {
    mockCollection.findOne.mockResolvedValue(baseRoom({ singWithMe: [post()] }));
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Bob" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const setArg = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(setArg.queue).toHaveLength(1);
    expect(setArg.queue[0].userName).toBe("Anna & Bob");
    expect(setArg.queue[0].videoId).toBe("dQw4w9WgXcQ");
    expect(setArg.singWithMe[0].queued).toBe(true);
  });

  it("does not re-queue once already queued, but still adds the singer", async () => {
    mockCollection.findOne.mockResolvedValue(
      baseRoom({ singWithMe: [post({ joinedSingers: ["Anna", "Bob"], queued: true })] })
    );
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { postId: "swm-1", userName: "Cara" },
    });
    const res = createRes();
    await joinHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const setArg = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(setArg.queue).toBeUndefined();
    expect(setArg.singWithMe[0].joinedSingers).toEqual(["Anna", "Bob", "Cara"]);
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
