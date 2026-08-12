import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  createIndex: vi.fn(),
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

const rateLimitMock = vi.fn(() => true);
// True = "first rejection of this window", which is when a failure is recorded.
const markNotifiedMock = vi.fn(() => true);
vi.mock("../../lib/limits", async (importOriginal) => ({
  // Real constants (MAX_ENTRY_ID_LENGTH); only the stateful limiter is mocked.
  ...(await importOriginal<typeof import("../../lib/limits")>()),
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  markRateLimitNotified: (...args: unknown[]) => markNotifiedMock(...args),
}));

const trackEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
  isAnalyticsExempt: () => false,
}));

const sendQuotaAlertMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/alerts", () => ({
  sendQuotaAlertOnce: (...args: unknown[]) => sendQuotaAlertMock(...args),
}));

function eventOfType(type: string): Record<string, unknown> | null {
  const call = trackEventMock.mock.calls.find((args) => args[1] === type);
  return call ? (call[2] as Record<string, unknown>) : null;
}

const lookupEvent = () => eventOfType("link_lookup");
const failureEvent = () => eventOfType("search_failed");

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.YOUTUBE_API_KEY = "test-key";

import handler from "../../pages/api/video-lookup";

const ID = "dQw4w9WgXcQ";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
    getHeader: (name: string) => headers[name],
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
    getHeader: (name: string) => string | undefined;
  };
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

const fetchMock = vi.fn();

function videoItem(over: Record<string, any> = {}) {
  return {
    items: [
      {
        id: ID,
        snippet: {
          title: "Never Gonna Give You Up",
          thumbnails: { medium: { url: `https://i.ytimg.com/vi/${ID}/mq.jpg` } },
        },
        contentDetails: { duration: "PT3M33S" },
        statistics: { viewCount: "1500000000" },
        status: { embeddable: true },
        ...over,
      },
    ],
  };
}

const EXPECTED_RESULT = {
  title: "Never Gonna Give You Up",
  thumbnailUrl: `https://i.ytimg.com/vi/${ID}/mq.jpg`,
  videoId: ID,
  durationSeconds: 213,
  viewCount: 1500000000,
};

const quotaFailure = () =>
  jsonResponse(
    { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
    false,
    403
  );

function cachedDoc(ageMs: number) {
  return {
    key: `video:${ID}`,
    results: [EXPECTED_RESULT],
    createdAt: new Date(Date.now() - ageMs),
  };
}

const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(true);
  markNotifiedMock.mockReturnValue(true);
  mockCollection.findOne.mockResolvedValue(null);
  mockCollection.updateOne.mockResolvedValue({});
  fetchMock.mockImplementation(async () => jsonResponse(videoItem()));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/video-lookup", () => {
  it("rejects a malformed id without spending anything", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: "not-an-id" } }), res);

    expect(res.getStatus()).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects a missing id", async () => {
    const res = createRes();
    await handler(createMockReq({ query: {} }), res);

    expect(res.getStatus()).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a fresh cached video without touching YouTube, and still counts it", async () => {
    mockCollection.findOne.mockResolvedValue(cachedDoc(60_000));

    const res = createRes();
    await handler(createMockReq({ query: { id: ID, src: "paste" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([EXPECTED_RESULT]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(lookupEvent()).toMatchObject({
      src: "paste",
      lookupOutcome: "hit",
      lookupCache: "fresh",
    });
  });

  it("resolves a live video with one videos.list call and caches it", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: ID, src: "paste" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([EXPECTED_RESULT]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0][0]);
    // The entire point of this endpoint: never search.list.
    expect(url).toContain("/youtube/v3/videos");
    expect(url).not.toContain("/youtube/v3/search");
    expect(url).toContain("part=snippet%2CcontentDetails%2Cstatistics%2Cstatus");
    expect(lookupEvent()).toMatchObject({
      src: "paste",
      lookupOutcome: "hit",
      lookupCache: "miss",
    });
    // writeCache is fire-and-forget; give its promise chain a tick to land.
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
    expect(mockCollection.updateOne.mock.calls[0][0]).toEqual({ key: `video:${ID}` });
  });

  it("re-fetches a stale copy and refreshes it when YouTube answers", async () => {
    mockCollection.findOne.mockResolvedValue(cachedDoc(EIGHT_DAYS));

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(lookupEvent()).toMatchObject({ lookupCache: "miss" });
  });

  it("reports a video that isn't there without caching the miss", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ items: [] }));

    const res = createRes();
    await handler(createMockReq({ query: { id: ID, src: "paste" } }), res);

    expect(res.getStatus()).toBe(404);
    expect(res.getBody()).toMatchObject({ reason: "not_found" });
    // Private videos go public; a cached miss would outlive the fix.
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
    expect(lookupEvent()).toMatchObject({
      lookupOutcome: "not_found",
      lookupCache: "miss",
    });
    // A user-input outcome, not an outage — /admin's health card must not see it.
    expect(failureEvent()).toBeNull();
  });

  it("refuses a video that exists but can't be embedded", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(videoItem({ status: { embeddable: false } }))
    );

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(422);
    expect(res.getBody()).toMatchObject({ reason: "not_embeddable" });
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
    expect(lookupEvent()).toMatchObject({
      lookupOutcome: "not_embeddable",
      lookupCache: "miss",
    });
    expect(failureEvent()).toBeNull();
  });

  it("falls back to a stale copy when the quota is spent, and pages", async () => {
    mockCollection.findOne.mockResolvedValue(cachedDoc(EIGHT_DAYS));
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([EXPECTED_RESULT]);
    expect(res.getHeader("x-karaoq-search-cache")).toBe("stale");
    expect(sendQuotaAlertMock).toHaveBeenCalledOnce();
    expect(failureEvent()).toMatchObject({ failReason: "quota", searchOutcome: "stale" });
    // Breakage is search_failed, usage is link_lookup — never both.
    expect(lookupEvent()).toBeNull();
  });

  it("reports a spent quota with a reset time when nothing is cached", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(503);
    const body = res.getBody() as { reason: string; resetsAt: string };
    expect(body.reason).toBe("quota");
    expect(new Date(body.resetsAt).getTime()).toBeGreaterThan(Date.now());
    expect(failureEvent()).toMatchObject({ failReason: "quota", searchOutcome: "error" });
    expect(lookupEvent()).toBeNull();
  });

  it("serves a stale copy when YouTube is merely unreachable", async () => {
    mockCollection.findOne.mockResolvedValue(cachedDoc(EIGHT_DAYS));
    fetchMock.mockImplementation(async () => jsonResponse({}, false, 500));

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getHeader("x-karaoq-search-cache")).toBe("stale");
    expect(sendQuotaAlertMock).not.toHaveBeenCalled();
    expect(failureEvent()).toMatchObject({ failReason: "upstream", searchOutcome: "stale" });
  });

  it("returns 502 without caching anything when YouTube fails and nothing is cached", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, false, 500));

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(502);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
    expect(failureEvent()).toMatchObject({ failReason: "upstream", searchOutcome: "error" });
    expect(lookupEvent()).toBeNull();
  });

  it("rate-limits only uncached lookups, on its own generous bucket", async () => {
    rateLimitMock.mockReturnValue(false);

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      "video-lookup",
      20,
      60_000
    );
    expect(failureEvent()).toMatchObject({
      failReason: "rate_limited",
      searchOutcome: "error",
    });
  });

  it("records a throttled window once, not once per rejected lookup", async () => {
    rateLimitMock.mockReturnValue(false);
    markNotifiedMock.mockReturnValue(false);

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(429);
    expect(failureEvent()).toBeNull();
  });

  it("stays quiet when a stale copy carries a rate-limited lookup", async () => {
    rateLimitMock.mockReturnValue(false);
    mockCollection.findOne.mockResolvedValue(cachedDoc(EIGHT_DAYS));

    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(res.getStatus()).toBe(200);
    expect(failureEvent()).toBeNull();
  });
});

describe("link_lookup attribution", () => {
  it("lands an unrecognised src as 'unknown' rather than storing it", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: ID, src: "evil" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(lookupEvent()).toMatchObject({ src: "unknown" });
  });

  it("keeps the trending source distinct from a paste", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: ID, src: "trending" } }), res);

    expect(lookupEvent()).toMatchObject({ src: "trending" });
  });

  it("attributes the lookup to the pasting room, uppercased", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: ID, roomId: "abcd1" } }), res);

    expect(lookupEvent()).toMatchObject({ roomId: "ABCD1" });
  });

  it("drops an implausible roomId to '' instead of storing it", async () => {
    const res = createRes();
    await handler(
      createMockReq({ query: { id: ID, roomId: "R".repeat(65) } }),
      res
    );

    expect(lookupEvent()).toMatchObject({ roomId: "" });
  });

  it("stores no YouTube metadata on the event", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    const event = lookupEvent()!;
    expect(event.videoId).toBeUndefined();
    expect(event.songTitle).toBeUndefined();
  });

  it("emits exactly one event per request", async () => {
    const res = createRes();
    await handler(createMockReq({ query: { id: ID } }), res);

    expect(trackEventMock).toHaveBeenCalledOnce();
  });
});
