import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room } from "../../pages/api/types";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
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

import handler from "../../pages/api/queue/[id]/index";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
  };
}

describe("POST /api/queue/[id] - Room creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new room when none exists", async () => {
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockResolvedValue({ insertedId: "x" });

    const req = createMockReq({ method: "POST", query: { id: "ABC12" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(201);
    expect(res.getBody()).toEqual({
      id: "ABC12",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
    });
    expect(mockCollection.insertOne).toHaveBeenCalledWith({
      id: "ABC12",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
    });
  });

  it("returns existing room with isPlaying reset to false", async () => {
    const existing: Room = {
      id: "ABC12",
      queue: [{ id: "e1", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
    };
    mockCollection.findOne.mockResolvedValue(existing);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({ method: "POST", query: { id: "ABC12" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(false);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ABC12" },
      { $set: { isPlaying: false } }
    );
  });

  it("rejects non-string room ID with 400", async () => {
    const req = createMockReq({ method: "POST", query: { id: ["a", "b"] } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });
});

describe("GET /api/queue/[id] - Room retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns room when it exists", async () => {
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({ method: "GET", query: { id: "XYZ99" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ ...room, isPlaying: true, reactionsEnabled: true, reactions: [] });
  });

  it("defaults isPlaying to false for legacy rooms", async () => {
    const legacyRoom = { id: "OLD01", queue: [], activeVideoIndex: 0 };
    mockCollection.findOne.mockResolvedValue(legacyRoom);

    const req = createMockReq({ method: "GET", query: { id: "OLD01" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(false);
  });

  it("returns 404 for non-existent room", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({ method: "GET", query: { id: "NOPE1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects unsupported HTTP methods", async () => {
    const req = createMockReq({ method: "DELETE", query: { id: "ABC12" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
