import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockInsertOne = vi.fn();

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({ collection: () => ({ insertOne: mockInsertOne }) }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/analytics/suggestion";

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

describe("POST /api/analytics/suggestion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tracks a valid song_pick suggestion", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({
      method: "POST",
      body: {
        roomId: "ROOM1",
        suggestionSource: "song_pick",
        sectionId: "genre",
        categoryId: "crowd-pleasers",
        songTitle: "Bohemian Rhapsody",
        songArtist: "Queen",
      },
    });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ ok: true });
    expect(mockInsertOne).toHaveBeenCalledOnce();
  });

  it("tracks a valid random suggestion", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({
      method: "POST",
      body: {
        roomId: "ROOM1",
        suggestionSource: "random",
      },
    });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(200);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });

  it("rejects missing roomId", async () => {
    const req = createMockReq({
      method: "POST",
      body: { suggestionSource: "random" },
    });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects invalid suggestionSource", async () => {
    const req = createMockReq({
      method: "POST",
      body: { roomId: "ROOM1", suggestionSource: "invalid" },
    });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const req = createMockReq({
      method: "POST",
      body: "not json",
    });
    const res = createRes();

    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });
});
