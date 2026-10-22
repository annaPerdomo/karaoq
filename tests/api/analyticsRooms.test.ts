// About the filter's shape, not the aggregation: a "live" narrowing that
// silently drops the search box would look exactly like a working page.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { ADMIN_LIVE_WINDOW_MS } from "../../lib/liveWindows";

const mockAggregateToArray = vi.fn();
const mockAggregate = vi.fn(() => ({ toArray: mockAggregateToArray }));
const mockCountDocuments = vi.fn();
const mockDistinct = vi.fn();
const mockRoomsCountDocuments = vi.fn();
const mockEventsDistinct = vi.fn();

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) =>
          name === "rooms"
            ? {
                distinct: mockDistinct,
                countDocuments: mockRoomsCountDocuments,
                createIndex: vi.fn().mockResolvedValue({}),
              }
            : {
                aggregate: mockAggregate,
                countDocuments: mockCountDocuments,
                distinct: mockEventsDistinct,
                createIndex: vi.fn().mockResolvedValue({}),
              },
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.ANALYTICS_SECRET = "s3cret";

import handler from "../../pages/api/analytics/rooms";

function createRes() {
  let statusCode = 200;
  let body: any = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
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

/** The $match the list actually paged over. */
function matchStage(): any {
  return mockAggregate.mock.calls[0][0][0].$match;
}

/** The stage that reads the room's own doc, by the field it lands in. */
function roomLookup(): any {
  return mockAggregate.mock.calls[0][0]
    .find((stage: any) => stage.$lookup?.as === "roomDoc").$lookup;
}

async function get(query: Record<string, string> = {}) {
  const res = createRes();
  await handler(createMockReq({ method: "GET", query, headers: AUTH }), res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAggregateToArray.mockResolvedValue([]);
  mockCountDocuments.mockResolvedValue(0);
  mockDistinct.mockResolvedValue(["LIVE1", "LIVE2"]);
  mockRoomsCountDocuments.mockResolvedValue(0);
  mockEventsDistinct.mockResolvedValue([]);
});

describe("GET /api/analytics/rooms", () => {
  it("refuses a request without the secret", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);

    expect(res.getStatus()).toBe(401);
    expect(mockAggregate).not.toHaveBeenCalled();
    expect(mockDistinct).not.toHaveBeenCalled();
  });

  it("lists every room when the live filter is off", async () => {
    await get();

    expect(matchStage()).toEqual({ type: "room_created" });
  });

  it("pages over live rooms only when the filter is on", async () => {
    await get({ live: "1" });

    expect(matchStage()).toEqual({
      type: "room_created",
      roomId: { $in: ["LIVE1", "LIVE2"] },
    });
  });

  it("keeps the search box working underneath the live filter", async () => {
    await get({ live: "1", q: "ab" });

    // Both conditions on roomId, not one overwriting the other.
    expect(matchStage().roomId).toEqual({
      $regex: "^ab",
      $options: "i",
      $in: ["LIVE1", "LIVE2"],
    });
  });

  it("shows nothing rather than everything when no room is live", async () => {
    mockDistinct.mockResolvedValue([]);

    await get({ live: "1" });

    expect(matchStage().roomId).toEqual({ $in: [] });
  });

  it("counts the live badge over every room, not just the search's matches", async () => {
    mockCountDocuments.mockResolvedValue(2);

    const res = await get({ q: "zz" });

    // Scoping this to the query would blank the badge on a search that matches
    // nothing live.
    expect(mockCountDocuments).toHaveBeenCalledWith({
      type: "room_created",
      roomId: { $in: ["LIVE1", "LIVE2"] },
    });
    expect(res.getBody().liveCount).toBe(2);
  });

  it("asks for live rooms by recent activity, not by an open page", async () => {
    const before = Date.now();
    await get();

    const filter = mockDistinct.mock.calls[0][1];
    const cutoff = filter.lastActivity.$gte.getTime();
    expect(mockDistinct.mock.calls[0][0]).toBe("id");
    expect(cutoff).toBeGreaterThanOrEqual(before - ADMIN_LIVE_WINDOW_MS - 50);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - ADMIN_LIVE_WINDOW_MS + 50);
  });

  it("reads only the timestamp out of the room doc", async () => {
    await get();

    // A room doc carries its whole queue.
    expect(roomLookup().localField).toBeUndefined();
    expect(roomLookup().pipeline).toContainEqual({
      $project: { _id: 0, lastActivity: 1, autoAdvance: 1 },
    });
  });

  it("reports more pages without handing out the row that proved it", async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ roomId: `R${i}` }));
    mockAggregateToArray.mockResolvedValue(rows);

    const res = await get();

    expect(res.getBody().rooms).toHaveLength(25);
    expect(res.getBody().hasMore).toBe(true);
  });

  describe("rightNow", () => {
    it("reports live from liveRoomCount, distinct created rooms, and how many of them sang", async () => {
      mockRoomsCountDocuments.mockResolvedValue(3);
      mockEventsDistinct
        .mockResolvedValueOnce(["A", "B"])
        .mockResolvedValueOnce(["A"]);

      const res = await get();

      expect(res.getBody().rightNow).toEqual({ live: 3, created: 2, sang: 1 });
    });

    it("reports zero sang without a second lookup when nothing was created", async () => {
      mockEventsDistinct.mockResolvedValueOnce([]);

      const res = await get();

      expect(res.getBody().rightNow).toEqual({ live: 0, created: 0, sang: 0 });
      expect(mockEventsDistinct).toHaveBeenCalledTimes(1);
    });

    it("skips the computation past the first page", async () => {
      const res = await get({ skip: "25" });

      expect(res.getBody().rightNow).toBeNull();
      expect(mockEventsDistinct).not.toHaveBeenCalled();
    });

    it("skips the computation under a search", async () => {
      const res = await get({ q: "ab" });

      expect(res.getBody().rightNow).toBeNull();
      expect(mockEventsDistinct).not.toHaveBeenCalled();
    });

    it("reports null rather than failing the whole list when it errors", async () => {
      mockEventsDistinct.mockRejectedValueOnce(new Error("down"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await get();

      expect(res.getStatus()).toBe(200);
      expect(res.getBody().rightNow).toBeNull();
      spy.mockRestore();
    });
  });
});
