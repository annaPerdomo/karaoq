import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();
function collectionFor(name: string): FakeCollection {
  let c = collections.get(name);
  if (!c) {
    c = fakeCollection();
    collections.set(name, c);
  }
  return c;
}

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({ collection: (name: string) => collectionFor(name) }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.ANALYTICS_SECRET = "s3cret";

import handler from "../../pages/api/analytics/room";

function createRes() {
  let statusCode = 200;
  let body: any = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = JSON.parse(JSON.stringify(data)); return res; },
    setHeader: vi.fn(),
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => any;
  };
}

const AUTH = { "x-analytics-secret": "s3cret" };

async function get(roomId = "ABCD1") {
  const res = createRes();
  await handler(
    createMockReq({ method: "GET", query: { roomId }, headers: AUTH }),
    res
  );
  return res;
}

let nextEventId = 0;
function seedSearchRun(roomId: string, overrides: Record<string, unknown> = {}, timestamp?: Date) {
  nextEventId += 1;
  collectionFor("analytics_events").seed({
    _id: `evt-${nextEventId}`,
    type: "search_run",
    roomId,
    timestamp: timestamp ?? new Date(Date.now() + nextEventId),
    query: "abba waterloo",
    searchCache: "fresh",
    resultCount: 3,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  collections.clear();
});

describe("GET /api/analytics/room — search_run", () => {
  it("returns a search_run row in searchRuns without disturbing searchFails", async () => {
    seedSearchRun("ABCD1", {
      query: "abba waterloo",
      searchCache: "miss",
      songKnown: true,
      resultCount: 5,
    });
    collectionFor("analytics_events").seed({
      _id: "evt-fail",
      type: "search_failed",
      roomId: "ABCD1",
      timestamp: new Date(),
      failReason: "quota",
      searchOutcome: "error",
    });

    const res = await get("ABCD1");

    expect(res.getStatus()).toBe(200);
    const body = res.getBody();
    expect(body.searchRuns).toHaveLength(1);
    expect(body.searchRuns[0]).toMatchObject({
      query: "abba waterloo",
      cache: "miss",
      songKnown: true,
      resultCount: 5,
    });
    expect(typeof body.searchRuns[0].timestamp).toBe("string");
    expect(body.searchFails).toHaveLength(1);
  });

  it("keeps only the last 300 search_run rows", async () => {
    const base = Date.now();
    for (let i = 0; i < 301; i++) {
      seedSearchRun("ABCD1", { query: `q${i}` }, new Date(base + i));
    }

    const res = await get("ABCD1");

    const body = res.getBody();
    expect(body.searchRuns).toHaveLength(300);
    expect(body.searchRuns[0].query).toBe("q1");
    expect(body.searchRuns[299].query).toBe("q300");
  });

  it("does not let 301 search_run rows evict room_created from the main fold", async () => {
    collectionFor("analytics_events").seed({
      _id: "evt-created",
      type: "room_created",
      roomId: "ABCD1",
      timestamp: new Date(0),
      fairMode: true,
    });
    const base = Date.now();
    for (let i = 0; i < 301; i++) {
      seedSearchRun("ABCD1", { query: `q${i}` }, new Date(base + i));
    }

    const res = await get("ABCD1");

    const body = res.getBody();
    expect(body.searchRuns).toHaveLength(300);
    expect(body.fairRotation.started).not.toBeNull();
  });
});
