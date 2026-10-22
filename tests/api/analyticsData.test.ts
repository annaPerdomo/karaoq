import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const adminAuthMock = vi.fn(() => true);
vi.mock("../../lib/adminAuth", () => ({
  isAuthorizedAdmin: (...args: unknown[]) => adminAuthMock(...args),
}));

function isSourcesPipeline(pipeline: any[]): boolean {
  const match = pipeline[0]?.$match;
  const group = pipeline[1]?.$group;
  return (
    match?.type === "room_created" &&
    !!match?.timestamp &&
    !!group &&
    JSON.stringify(group._id).includes("$ref")
  );
}

// Every $facet stage in this handler expects its named branches present, even empty.
function facetDefault(pipeline: any[]): Record<string, unknown[]> | null {
  const facet = pipeline.find((stage) => stage.$facet)?.$facet;
  if (!facet) return null;
  return Object.fromEntries(Object.keys(facet).map((key) => [key, []]));
}

const fakeCollection = {
  countDocuments: vi.fn(async () => 0),
  distinct: vi.fn(async () => []),
  aggregate: vi.fn((pipeline: any[]) => ({
    toArray: async () => {
      if (isSourcesPipeline(pipeline)) {
        return [
          { _id: "reddit", count: 5 },
          { _id: "from a room link", count: 4 },
          { _id: "direct", count: 3 },
          { _id: "untracked", count: 1 },
        ];
      }
      const facet = facetDefault(pipeline);
      return facet ? [facet] : [];
    },
  })),
};

vi.mock("../../lib/mongodb", () => ({
  getAnalyticsDb: async () => ({ collection: () => fakeCollection }),
  getYoutubeSongDataCollection: async () => fakeCollection,
}));

import handler from "../../pages/api/analytics/data";

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
    setHeader() {
      return res;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

describe("GET /api/analytics/data - growth.sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMock.mockReturnValue(true);
  });

  it("groups room_created by ref, referrer, a room-link entry, direct, or untracked", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as { growth: { sources: { _id: string; count: number }[] } };
    expect(body.growth.sources).toEqual([
      { _id: "reddit", count: 5 },
      { _id: "from a room link", count: 4 },
      { _id: "direct", count: 3 },
      { _id: "untracked", count: 1 },
    ]);
  });
});
