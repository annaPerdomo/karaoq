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

import handler from "../../pages/api/analytics/quota";
import { SEARCH_DAY_QUOTA, ledgerDay } from "../../lib/corpusBudget";

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

async function get(headers: Record<string, string> = AUTH) {
  const res = createRes();
  await handler(
    createMockReq({ method: "GET", query: {}, headers }),
    res
  );
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  collections.clear();
});

describe("GET /api/analytics/quota", () => {
  it("401s without the admin secret", async () => {
    const res = await get({});
    expect(res.getStatus()).toBe(401);
  });

  it("returns the quota, 7 zero-filled days oldest-first, and a seeded mop-up", async () => {
    const now = Date.now();
    const today = ledgerDay(now);
    collectionFor("cron_state").seed({
      _id: `budget:${today}`,
      searches: 12,
      cronSearches: 4,
      pages: 0,
      lookups: 0,
      mopUp: {
        at: new Date(now),
        liveRooms: 0,
        budget: 88,
        searched: 20,
        filled: 6,
        skipped: null,
        quotaSpent: false,
        error: null,
      },
    });

    const res = await get();
    expect(res.getStatus()).toBe(200);
    const body = res.getBody();
    expect(body.quota).toBe(SEARCH_DAY_QUOTA);
    expect(body.today).toBe(today);
    expect(body.days).toHaveLength(7);
    expect(body.days[6].day).toBe(today);
    expect(body.days[6].searches).toBe(12);
    expect(body.days[6].mopUp).toMatchObject({ filled: 6, searched: 20 });
    expect(body.days[0].searches).toBe(0);
  });

  it("breaks each day's billed searches out per room, heaviest first, cache hits excluded", async () => {
    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const nineDaysAgo = new Date(now - 9 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000);
    const events = collectionFor("analytics_events");
    [
      { type: "search_run", roomId: "ABCD", searchCache: "miss", timestamp: hourAgo, country: "CZ", city: "Brno" },
      { type: "search_run", roomId: "ABCD", searchCache: "miss", timestamp: new Date(now), country: "CZ", city: "Prague" },
      { type: "search_run", roomId: "ABCD", searchCache: "fresh", timestamp: hourAgo },
      { type: "search_run", roomId: "ABCD", searchCache: "corpus", timestamp: hourAgo },
      { type: "search_run", roomId: "ABCD", searchCache: "stale", timestamp: nineDaysAgo },
      { type: "search_run", roomId: "WXYZ", searchCache: "miss", timestamp: hourAgo },
      { type: "search_run", roomId: "OLDR", searchCache: "miss", timestamp: nineDaysAgo },
      { type: "search_run", roomId: "GONE", searchCache: "miss", timestamp: fortyDaysAgo },
      { type: "search_run", roomId: "", searchCache: "miss", timestamp: hourAgo },
      { type: "search_failed", roomId: "WXYZ", timestamp: hourAgo },
    ].forEach((doc, i) => events.seed({ _id: `e${i}`, ...doc }));

    const res = await get();
    expect(res.getStatus()).toBe(200);
    const body = res.getBody();
    expect(body.roomsByDay).toHaveLength(30);
    expect(body.roomsByDay.slice(-7).map((d: any) => d.day)).toEqual(body.days.map((d: any) => d.day));
    const today = body.roomsByDay[29];
    expect(today.day).toBe(ledgerDay(now));
    expect(today.searches).toBe(4);
    expect(today.roomCount).toBe(2);
    expect(today.rooms.map((r: any) => r.roomId)).toEqual(["ABCD", "WXYZ"]);
    expect(today.rooms[0]).toMatchObject({ searches: 2, country: "CZ", city: "Prague" });
    expect(today.rooms[0].lastAt).toBe(new Date(now).toISOString());
    expect(today.rooms[1]).toMatchObject({ searches: 1 });
    expect(today.rooms[1].country).toBeUndefined();
    const nineBack = body.roomsByDay.find((d: any) => d.rooms.some((r: any) => r.roomId === "OLDR"));
    expect(nineBack).toBeDefined();
    expect(body.roomsByDay.some((d: any) => d.rooms.some((r: any) => r.roomId === "GONE"))).toBe(false);
    expect(body.roomsByDay[0]).toMatchObject({ searches: 0, roomCount: 0, rooms: [] });
    expect(body.sourcesByDay).toHaveLength(30);
    expect(body.sourcesByDay[29]).toEqual({
      day: ledgerDay(now),
      sources: { miss: 4, fresh: 1, coalesced: 0, stale: 0, corpus: 1 },
    });
    expect(body.sourcesByDay.find((d: any) => d.day === nineBack.day).sources.stale).toBe(1);
  });

  it("405s on POST", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "POST", query: {}, headers: AUTH }),
      res
    );
    expect(res.getStatus()).toBe(405);
  });
});
