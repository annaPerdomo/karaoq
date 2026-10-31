import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import handler from "../../pages/api/analytics/screens";
import {
  median,
  pickFeatureFeedback,
  summarizeMusicVideo,
  windowDays,
  type FeedbackRow,
} from "../../lib/screensStats";
import { LOGO_STORE_BUDGET_BYTES } from "../../lib/limits";

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
const DAY = 24 * 60 * 60 * 1000;

async function get(query: Record<string, string> = {}, headers: Record<string, string> = AUTH) {
  const res = createRes();
  await handler(createMockReq({ method: "GET", query, headers }), res);
  return res;
}

let seq = 0;
function event(type: string, roomId: string, daysAgo: number, extra: Record<string, unknown> = {}) {
  collectionFor("analytics_events").seed({
    _id: `e${++seq}`,
    type,
    roomId,
    timestamp: new Date(Date.now() - daysAgo * DAY),
    ...extra,
  });
}

// Midday UTC, so "days ago" offsets never straddle a UTC midnight.
const NOW = Date.parse("2026-10-30T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  collections.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/analytics/screens", () => {
  it("401s without the admin secret", async () => {
    const res = await get({}, {});
    expect(res.getStatus()).toBe(401);
  });

  it("400s on a window other than 7, 30 or 90", async () => {
    expect((await get({ days: "14" })).getStatus()).toBe(400);
    expect((await get({ days: "abc" })).getStatus()).toBe(400);
    for (const days of ["0x1e", "3e1", "30.0", " 30"]) {
      expect((await get({ days })).getStatus()).toBe(400);
    }
  });

  it("defaults to 30 days, zero-filled, with empty sections", async () => {
    const res = await get();
    expect(res.getStatus()).toBe(200);
    const body = res.getBody();
    expect(body.days).toBe(30);
    expect(body.musicVideo.daily).toHaveLength(30);
    expect(body.musicVideo.daily.every((d: { rooms: number }) => d.rooms === 0)).toBe(true);
    expect(body.musicVideo.medianMinutesOpen).toBeNull();
    expect(body.brand.storageBudgetBytes).toBe(LOGO_STORE_BUDGET_BYTES);
    expect(body.feedback).toEqual([]);
  });

  it("counts rooms, repeat rooms, resolve sources, medians and daily rooms", async () => {
    // AAAA opens on two days, BBBB twice on one day, CCCC is outside a 7-day window.
    event("music_video_screen_opened", "AAAA", 0);
    event("music_video_screen_opened", "AAAA", 2);
    event("music_video_screen_opened", "BBBB", 0);
    event("music_video_screen_opened", "BBBB", 0);
    event("music_video_screen_opened", "CCCC", 20);
    event("music_video_screen_closed", "AAAA", 0, { durationSeconds: 600, songsShown: 8, songsUnavailable: 2 });
    event("music_video_screen_closed", "BBBB", 0, { durationSeconds: 1800, songsShown: 2, songsUnavailable: 0 });
    event("original_video_resolved", "AAAA", 0, { source: "cache", found: true });
    event("original_video_resolved", "AAAA", 0, { source: "cache", found: false });
    event("original_video_resolved", "BBBB", 0, { source: "live", found: true });
    event("original_video_resolved", "BBBB", 0, { source: "none", found: false });
    event("original_video_resolved", "BBBB", 0, { source: "quota", found: false });
    event("original_video_swapped", "AAAA", 0, { source: "candidate" });
    event("original_video_swapped", "BBBB", 0, { source: "link" });
    event("music_video_error", "AAAA", 0, { code: 150 });
    event("music_video_offset", "AAAA", 0, { offsetSeconds: -2 });
    event("music_video_offset", "AAAA", 0, { offsetSeconds: 4 });
    event("music_video_offset", "AAAA", 0, { offsetSeconds: 1 });
    event("music_video_link", "AAAA", 0, { action: "copy" });

    const body = (await get({ days: "7" })).getBody();
    const mv = body.musicVideo;
    expect(mv.rooms).toBe(2);
    expect(mv.opens).toBe(4);
    expect(mv.repeatRooms).toBe(1);
    expect(mv.medianMinutesOpen).toBe(20);
    expect(mv.songsShown).toBe(10);
    expect(mv.songsUnavailable).toBe(2);
    expect(mv.swaps).toBe(2);
    expect(mv.resolve).toEqual({ cache: 2, live: 1, quota: 1, busy: 0, none: 1 });
    expect(mv.songsResolved).toBe(4);
    expect(mv.songsWithVideo).toBe(2);
    expect(mv.errors).toEqual([{ code: 150, count: 1 }]);
    expect(mv.songsNudged).toBe(3);
    expect(mv.medianAbsOffset).toBe(2);
    expect(mv.links).toEqual({ open: 0, copy: 1 });
    expect(mv.daily).toHaveLength(7);
    expect(mv.daily[6].rooms).toBe(2);
    expect(mv.daily[4].rooms).toBe(1);
    expect(mv.daily[5].rooms).toBe(0);
  });

  it("splits brand saves by surface, counts rejections, and reads logo storage", async () => {
    event("brand_saved", "AAAA", 0, { logo: true, colors: true, cleared: false, surface: "host" });
    event("brand_saved", "AAAA", 1, { logo: true, colors: false, cleared: false, surface: "display" });
    event("brand_saved", "BBBB", 0, { logo: false, colors: true, cleared: false, surface: "display" });
    event("brand_saved", "CCCC", 0, { logo: false, colors: false, cleared: true, surface: "host" });
    event("logo_uploaded", "AAAA", 0, { bytes: 4000 });
    event("logo_upload_rejected", "DDDD", 0, { reason: "type" });
    event("logo_upload_rejected", "DDDD", 0, { reason: "size" });
    event("logo_upload_rejected", "EEEE", 0, { reason: "size" });
    event("logo_upload_rejected", "EEEE", 0, { reason: "storage_full" });
    const logos = collectionFor("room_logos");
    logos.seed({ _id: "AAAA:1", roomId: "AAAA", size: 4000 });
    logos.seed({ _id: "BBBB:1", roomId: "BBBB", size: 6000 });
    logos.seed({ _id: "BBBB:2", roomId: "BBBB", size: 1000, expireAt: new Date(Date.now() + DAY) });

    const brand = (await get()).getBody().brand;
    expect(brand.roomsWithLogo).toBe(1);
    expect(brand.roomsWithColors).toBe(2);
    expect(brand.saves).toEqual({ host: 2, display: 2 });
    expect(brand.clears).toBe(1);
    expect(brand.uploads).toBe(1);
    expect(brand.rejected).toEqual({ type: 1, size: 2, storage_full: 1 });
    expect(brand.storageBytes).toBe(11000);
    expect(brand.committedLogos).toBe(2);
  });

  it("returns feedback from /video pages and feature rooms only", async () => {
    event("brand_saved", "AAAA", 0, { logo: true, surface: "host" });
    const fb = collectionFor("feedback");
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
    fb.seed({ _id: "f1", kind: "bug", message: "video lag", page: "/display/ZZZZ/video", createdAt: at(1) });
    fb.seed({
      _id: "f2",
      kind: "idea",
      message: "logo",
      roomId: "aaaa",
      page: "/host/AAAA",
      contact: "someone@example.com",
      userAgent: "Mozilla/5.0",
      createdAt: at(0),
    });
    fb.seed({ _id: "f3", kind: "bug", message: "unrelated", roomId: "QQQQ", page: "/sing/QQQQ", createdAt: at(0) });
    fb.seed({ _id: "f4", kind: "bug", message: "old", page: "/display/ZZZZ/video", createdAt: at(60) });

    const feedback = (await get()).getBody().feedback;
    expect(feedback.map((f: { id: string }) => f.id)).toEqual(["f2", "f1"]);
    expect(feedback[0]).not.toHaveProperty("contact");
    expect(feedback[0]).not.toHaveProperty("userAgent");
    expect(feedback[0]).not.toHaveProperty("roomId");
  });
});

describe("screens stats helpers", () => {
  it("takes the middle of an even count", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("repeat rooms need two distinct UTC days", () => {
    const days = windowDays(7, Date.parse("2026-10-30T12:00:00Z"));
    const stats = summarizeMusicVideo(
      [
        { type: "music_video_screen_opened", roomId: "AAAA", timestamp: "2026-10-29T23:30:00Z" },
        { type: "music_video_screen_opened", roomId: "AAAA", timestamp: "2026-10-30T00:30:00Z" },
        { type: "music_video_screen_opened", roomId: "BBBB", timestamp: "2026-10-30T01:00:00Z" },
        { type: "music_video_screen_opened", roomId: "BBBB", timestamp: "2026-10-30T22:00:00Z" },
      ],
      days
    );
    expect(days[0]).toBe("2026-10-24");
    expect(days[6]).toBe("2026-10-30");
    expect(stats.rooms).toBe(2);
    expect(stats.repeatRooms).toBe(1);
    expect(stats.daily.map((d) => d.rooms)).toEqual([0, 0, 0, 0, 0, 1, 2]);
  });

  it("caps feedback at 20, newest first", () => {
    const rows: FeedbackRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({
        _id: `f${i}`,
        kind: "bug",
        message: "m",
        page: "/display/AAAA/video",
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
      });
    }
    rows.push({ _id: "other", kind: "bug", message: "m", page: "/host/AAAA", createdAt: new Date() });
    const picked = pickFeatureFeedback(rows, new Set());
    expect(picked).toHaveLength(20);
    expect(picked[0].id).toBe("f29");
    expect(picked[19].id).toBe("f10");
  });
});
