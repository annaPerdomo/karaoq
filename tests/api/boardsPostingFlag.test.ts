import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const isFlagEnabledMock = vi.fn();
vi.mock("../../lib/featureFlags", () => ({
  isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args),
}));

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

import singWithMeHandler from "../../pages/api/queue/[id]/sing-with-me";
import suggestionsHandler from "../../pages/api/queue/[id]/suggestions";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("boards_posting kill switch", () => {
  it("503s a sing-with-me post when off, before any DB read", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const res = createRes();
    await singWithMeHandler(
      createMockReq({ method: "POST", query: { id: "ROOM1" }, body: {} }),
      res
    );
    expect(res.getStatus()).toBe(503);
    expect(res.getBody()).toEqual({ code: 503, message: "Temporarily unavailable." });
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it("503s a suggestion post when off, before any DB read", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const res = createRes();
    await suggestionsHandler(
      createMockReq({ method: "POST", query: { id: "ROOM1" }, body: {} }),
      res
    );
    expect(res.getStatus()).toBe(503);
    expect(res.getBody()).toEqual({ code: 503, message: "Temporarily unavailable." });
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it("still 400s invalid bodies when the flag is on", async () => {
    isFlagEnabledMock.mockResolvedValue(true);
    const res = createRes();
    await singWithMeHandler(
      createMockReq({ method: "POST", query: { id: "ROOM1" }, body: {} }),
      res
    );
    expect(res.getStatus()).toBe(400);
  });
});
