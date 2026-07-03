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

import handler from "../../pages/api/queue/[id]/videos";

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

describe("POST /api/queue/[id]/videos - Add song to queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a song to an existing room's queue", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        entryId: "entry-1",
        userName: "Anna",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Never Gonna Give You Up",
      },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $push: {
          queue: {
            id: "entry-1",
            userName: "Anna",
            videoId: "dQw4w9WgXcQ",
            songTitle: "Never Gonna Give You Up",
          },
        },
        $set: { lastActivity: expect.any(Date) },
      }
    );
  });

  it("returns 404 when room does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1" },
      body: {
        entryId: "e1",
        userName: "Bob",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Song",
      },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { entryId: "e1" }, // missing userName, videoId, songTitle
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it("returns 400 when body is undefined", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: undefined,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("returns 400 when body is invalid JSON string", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: "{not valid json",
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
