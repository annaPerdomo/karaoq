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

describe("GET /api/analytics/room — musicVideo", () => {
  function seedEvent(type: string, fields: Record<string, unknown> = {}, roomId = "ABCD1") {
    nextEventId += 1;
    collectionFor("analytics_events").seed({
      _id: `evt-${nextEventId}`,
      type,
      roomId,
      timestamp: new Date(Date.now() + nextEventId),
      ...fields,
    });
  }

  it("summarizes the room's music-video events and its musicVideoAt check-in", async () => {
    const seenAt = new Date("2026-11-05T20:00:00.000Z");
    collectionFor("rooms").seed({ _id: "room-1", id: "ABCD1", musicVideoAt: seenAt });
    seedEvent("music_video_screen_opened");
    seedEvent("original_video_resolved", { source: "live", found: true });
    seedEvent("original_video_resolved", { source: "cache", found: false });
    seedEvent("original_video_resolved", { source: "quota", found: false });
    seedEvent("original_video_swapped", { source: "search" });
    seedEvent("original_video_nudged", { offsetSeconds: 3 });
    seedEvent("original_video_nudged", { offsetSeconds: 0 });
    seedEvent("music_video_offset", { offsetSeconds: 3 });
    seedEvent("music_video_offset", { offsetSeconds: 3 });
    seedEvent("music_video_error", { code: 150 });
    seedEvent("music_video_error", { code: 150 });
    seedEvent("music_video_link", { action: "copy" });
    seedEvent("music_video_screen_closed", { durationSeconds: 1800, songsShown: 4, songsUnavailable: 1 });
    seedEvent("music_video_screen_opened", {}, "OTHER");

    const body = (await get("ABCD1")).getBody();

    expect(body.musicVideo).toMatchObject({
      lastSeenAt: seenAt.toISOString(),
      opens: 1,
      minutesOpen: 30,
      songsShown: 4,
      songsUnavailable: 1,
      songsResolved: 2,
      songsWithVideo: 1,
      songsWaiting: 1,
      swaps: 1,
      hostNudges: 1,
      songsPlayedOffset: 2,
      truncated: false,
      errors: [{ code: 150, count: 2 }],
      links: { open: 0, copy: 1 },
    });
    expect(typeof body.musicVideo.firstOpenedAt).toBe("string");
    expect(body.counts.songs).toBe(0);
  });

  it("sums what the players reported into the playback block", async () => {
    seedEvent("song_started", { surface: "display", afterSeconds: 1 });
    seedEvent("song_started", { surface: "display", afterSeconds: 40 });
    seedEvent("song_started", { surface: "host", afterSeconds: 0 });
    seedEvent("song_ended", { how: "ended", surface: "display", playedSeconds: 200 });
    seedEvent("song_ended", { how: "limit", surface: "display" });
    seedEvent("song_ended", { how: "embed_failed", surface: "display" });
    seedEvent("song_ended", {});
    seedEvent("song_skipped", { wasPlaying: true, playedSeconds: 12 });
    seedEvent("song_skipped", { wasPlaying: false });
    seedEvent("song_stopped", { playedSeconds: 5 });
    seedEvent("song_started", { surface: "display", afterSeconds: 1 }, "OTHER");

    const body = (await get("ABCD1")).getBody();

    expect(body.playback).toEqual({
      started: 3,
      slowStarts: 1,
      ended: 2,
      limit: 1,
      embedFailed: 1,
      skipped: 1,
      stepped: 1,
      stopped: 1,
      bySurface: { display: 2, host: 1 },
    });
    // Playback rows are not songs, searches or cheers.
    expect(body.counts).toMatchObject({ songs: 0, reactions: 0, searches: 0 });
  });

  it("reports an untouched room as empty", async () => {
    const body = (await get("ABCD1")).getBody();

    expect(body.playback).toMatchObject({ started: 0, ended: 0, bySurface: { display: 0, host: 0 } });

    expect(body.musicVideo).toMatchObject({
      lastSeenAt: null,
      firstOpenedAt: null,
      opens: 0,
      minutesOpen: null,
      songsResolved: 0,
    });
  });
});
