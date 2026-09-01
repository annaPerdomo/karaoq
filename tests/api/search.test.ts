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
  extractGeo: () => ({ country: "PH", region: "Central Visayas", city: "Cebu City" }),
}));

const recordDemandMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/searchDemand", () => ({
  recordSearchDemand: (...args: unknown[]) => recordDemandMock(...args),
}));

const recordSearchResultsMock = vi.fn(async (..._args: unknown[]) => ({
  videosUpserted: 0,
  cutsAdded: 0,
  // The default is the ordinary case: the query named a song the corpus carries.
  songKnown: true,
}));
const bankEvidenceMock = vi.fn(async (..._args: unknown[]) => 0);
vi.mock("../../lib/songCorpus", () => ({
  recordSearchResults: (...args: unknown[]) => recordSearchResultsMock(...args),
  bankSearchEvidence: (...args: unknown[]) => bankEvidenceMock(...args),
}));

const readSongCutsMock = vi.fn(async (..._args: unknown[]) => null as unknown);
vi.mock("../../lib/corpusRead", () => ({
  readSongCuts: (...args: unknown[]) => readSongCutsMock(...args),
}));

const sendQuotaAlertMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/alerts", () => ({
  sendQuotaAlertOnce: (...args: unknown[]) => sendQuotaAlertMock(...args),
}));

function demandWrite(): Record<string, unknown> | null {
  const call = recordDemandMock.mock.calls[0];
  return call ? (call[0] as Record<string, unknown>) : null;
}

function failureEvent(): Record<string, unknown> | null {
  const call = trackEventMock.mock.calls.find((args) => args[1] === "search_failed");
  return call ? (call[2] as Record<string, unknown>) : null;
}

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.YOUTUBE_API_KEY = "test-key";

import handler from "../../pages/api/search";
import { SONG_SECTIONS, buildSongQuery } from "../../app/queue/songSuggestions";
import { buildSearchQuery, searchCacheKey } from "../../lib/searchQuery";

/** What lib/searchDemand keys a query on; inlined because that module is
 *  mocked here. */
const demandKey = (q: string) => searchCacheKey(buildSearchQuery(q, true));

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

function searchItems(ids: string[]) {
  return {
    items: ids.map((id) => ({
      id: { videoId: id },
      snippet: {
        title: `Song ${id}`,
        thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mq.jpg` } },
      },
    })),
  };
}

/** No badges, but the call vouches for the ids — without a row, enrichment
 *  drops the result as gone. */
function videoItems(ids: string[]) {
  return { items: ids.map((id) => ({ id })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(true);
  markNotifiedMock.mockReturnValue(true);
  recordSearchResultsMock.mockResolvedValue({
    videosUpserted: 0,
    cutsAdded: 0,
    songKnown: true,
  });
  readSongCutsMock.mockResolvedValue(null);
  mockCollection.findOne.mockResolvedValue(null);
  mockCollection.updateOne.mockResolvedValue({});
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/search", () => {
  it("serves fresh cached results without touching any backend", async () => {
    const cached = [{ title: "Cached", thumbnailUrl: "t", videoId: "abc" }];
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: cached,
      createdAt: new Date(),
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("finds an entry left under the old cache key format", async () => {
    // Folding out punctuation orphaned every entry holding an apostrophe.
    const q = "Don't Stop Believin' karaoke";
    const legacyKey = `${q.trim().toLowerCase()}|any|relevance`;
    const cached = [{ title: "Journey", thumbnailUrl: "t", videoId: "abc" }];
    mockCollection.findOne.mockImplementation(async (filter: { key: string }) =>
      filter.key === legacyKey
        ? { key: legacyKey, results: cached, createdAt: new Date() }
        : null
    );

    const res = createRes();
    await handler(createMockReq({ query: { q } }), res);

    expect(res.getBody()).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { key: `${searchCacheKey(q)}|any|relevance` },
      expect.anything(),
      expect.anything()
    );
  });

  it("won't launder a stale legacy entry into a fresh one", async () => {
    const q = "beyoncé halo karaoke";
    const legacyKey = `${q.trim().toLowerCase()}|any|relevance`;
    mockCollection.findOne.mockImplementation(async (filter: { key: string }) =>
      filter.key === legacyKey
        ? {
            key: legacyKey,
            results: [{ title: "Old", thumbnailUrl: "t", videoId: "old" }],
            createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          }
        : null
    );

    await handler(createMockReq({ query: { q } }), createRes());

    expect(fetchMock).toHaveBeenCalled();
  });

  it("re-searches a stale entry and refreshes it when YouTube answers", async () => {
    const stale = [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }];
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: stale,
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["new"]));
      if (url.includes("/youtube/v3/videos")) return jsonResponse(videoItems(["new"]));
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([
      { title: "Song new", thumbnailUrl: "https://i.ytimg.com/vi/new/mq.jpg", videoId: "new" },
    ]);
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
  });

  it("falls back to a stale entry when the quota is spent", async () => {
    const stale = [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }];
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: stale,
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
        false,
        403
      )
    );

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual(stale);
    expect(res.getHeader("x-karaoq-search-cache")).toBe("stale");
  });

  it("reports the outage rather than replaying an empty stale entry", async () => {
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: [],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
        false,
        403
      )
    );

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(503);
    expect((res.getBody() as { reason: string }).reason).toBe("quota");
  });

  it("reports a spent quota with a reset time when nothing is cached", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
        false,
        403
      )
    );

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(503);
    const body = res.getBody() as { reason: string; resetsAt: string };
    expect(body.reason).toBe("quota");
    expect(new Date(body.resetsAt).getTime()).toBeGreaterThan(Date.now());
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("requests 50 results and enriches them with duration and view count", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a", "b"]));
      if (url.includes("/youtube/v3/videos")) {
        return jsonResponse({
          items: [
            {
              id: "a",
              contentDetails: { duration: "PT3M45S" },
              statistics: { viewCount: "1200000" },
            },
          ],
        });
      }
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "bohemian rhapsody" } }), res);

    const searchUrl = fetchMock.mock.calls.find(([u]) => String(u).includes("/search"))![0] as string;
    expect(searchUrl).toContain("maxResults=50");

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([
      {
        title: "Song a",
        thumbnailUrl: "https://i.ytimg.com/vi/a/mq.jpg",
        videoId: "a",
        durationSeconds: 225,
        viewCount: 1200000,
      },
      // "b" had no videos.list row — gone or private, so it is not served.
    ]);
    // writeCache is fire-and-forget; give its promise chain a tick to land.
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
  });

  it("neither serves nor caches a cut whose owner disabled embedding", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a", "b"]));
      if (url.includes("/youtube/v3/videos")) {
        return jsonResponse({
          items: [
            { id: "a", status: { embeddable: false } },
            { id: "b", status: { embeddable: true } },
          ],
        });
      }
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "let it go" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([
      { title: "Song b", thumbnailUrl: "https://i.ytimg.com/vi/b/mq.jpg", videoId: "b" },
    ]);
    // A fortnight of cache, so a blocked cut banked here outlives the search.
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
    const cached = mockCollection.updateOne.mock.calls[0][1] as {
      $set: { results: { videoId: string }[] };
    };
    expect(cached.$set.results.map((r) => r.videoId)).toEqual(["b"]);
  });

  it("still returns results when enrichment fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a"]));
      if (url.includes("/youtube/v3/videos")) throw new Error("enrichment down");
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual([
      { title: "Song a", thumbnailUrl: "https://i.ytimg.com/vi/a/mq.jpg", videoId: "a" },
    ]);
  });

  it("returns 502 without caching anything when the YouTube API fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse({}, false, 500);
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(502);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rate-limits only uncached searches", async () => {
    rateLimitMock.mockReturnValue(false);

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("collapses whitespace and stacked karaoke suffixes into one cache key", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a"]));
      if (url.includes("/youtube/v3/videos")) return jsonResponse({ items: [] });
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(
      createMockReq({ query: { q: "  Abba   Waterloo  Karaoke karaoke " } }),
      res
    );

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      key: "abba waterloo karaoke|any|relevance",
    });
    const searchUrl = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/search")
    )![0] as string;
    expect(searchUrl).toContain("q=Abba+Waterloo+Karaoke");
  });

  it("keys punctuation and accents onto the entry someone already paid for", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a"]));
      if (url.includes("/youtube/v3/videos")) return jsonResponse({ items: [] });
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "Beyoncé - Halo!" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      key: "beyonce halo|any|relevance",
    });
    const searchUrl = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/search")
    )![0] as string;
    expect(searchUrl).toContain("q=Beyonc%C3%A9+-+Halo%21");
  });

  it("collapses a karaoke suffix that isn't adjacent to the singer's own", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a"]));
      if (url.includes("/youtube/v3/videos")) return jsonResponse({ items: [] });
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "abba karaoke live karaoke" } }), res);

    expect(mockCollection.findOne).toHaveBeenCalledWith({
      key: "abba karaoke live|any|relevance",
    });
  });

  it("coalesces concurrent identical searches into one YouTube call", async () => {
    let releaseSearch!: (r: Response) => void;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/youtube/v3/search"))
        return new Promise<Response>((resolve) => { releaseSearch = resolve; });
      if (url.includes("/youtube/v3/videos"))
        return Promise.resolve(jsonResponse({ items: [] }));
      throw new Error("unexpected fetch " + url);
    });

    const res1 = createRes();
    const first = handler(createMockReq({ query: { q: "same song" } }), res1);
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes("/search"))
      ).toHaveLength(1)
    );

    const res2 = createRes();
    const second = handler(createMockReq({ query: { q: "Same  Song" } }), res2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    releaseSearch(jsonResponse(searchItems(["a"])));
    await Promise.all([first, second]);

    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes("/search"))
    ).toHaveLength(1);
    expect(res1.getStatus()).toBe(200);
    expect(res2.getStatus()).toBe(200);
    expect(res2.getHeader("x-karaoq-search-cache")).toBe("coalesced");
    expect(res2.getBody()).toEqual(res1.getBody());
  });

});

describe("search_failed tracking", () => {
  const quotaFailure = () =>
    jsonResponse(
      { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
      false,
      403
    );

  const burstFailure = () =>
    jsonResponse(
      { error: { message: "Rate limit", errors: [{ reason: "rateLimitExceeded" }] } },
      false,
      429
    );

  it("records a spent quota the user saw an error for", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(503);
    expect(failureEvent()).toMatchObject({
      failReason: "quota",
      searchOutcome: "error",
    });
  });

  it("answers a catalogued song from the corpus rather than an error", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());
    const cuts = [{ title: "A cut", thumbnailUrl: "t", videoId: "c1", pinned: true }];
    readSongCutsMock.mockResolvedValue(cuts);

    const res = createRes();
    await handler(createMockReq({ query: { q: "abba dancing queen karaoke" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual(cuts);
    expect(res.getHeader("x-karaoq-search-cache")).toBe("corpus");
    expect(failureEvent()).toMatchObject({
      failReason: "quota",
      searchOutcome: "corpus",
    });
  });

  it("never answers a filtered search from the corpus", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());
    readSongCutsMock.mockResolvedValue([
      { title: "A cut", thumbnailUrl: "t", videoId: "c1" },
    ]);

    const res = createRes();
    await handler(
      createMockReq({ query: { q: "abba dancing queen karaoke", duration: "short" } }),
      res
    );

    expect(res.getStatus()).toBe(503);
    expect(readSongCutsMock).not.toHaveBeenCalled();
  });

  it("records a spent quota the cache covered for", async () => {
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(failureEvent()).toMatchObject({
      failReason: "quota",
      searchOutcome: "stale",
    });
  });

  it("separates an unreachable YouTube from a spent quota", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, false, 500));

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(502);
    expect(failureEvent()).toMatchObject({
      failReason: "upstream",
      searchOutcome: "error",
    });
  });

  it("records the 429 a rate-limited singer actually sees", async () => {
    rateLimitMock.mockReturnValue(false);

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(429);
    expect(failureEvent()).toMatchObject({
      failReason: "rate_limited",
      searchOutcome: "error",
    });
  });

  it("records a throttled window once, not once per rejected request", async () => {
    rateLimitMock.mockReturnValue(false);
    markNotifiedMock.mockReturnValue(false);

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(429);
    expect(failureEvent()).toBeNull();
  });

  it("stays quiet when a stale copy carries a rate-limited search", async () => {
    rateLimitMock.mockReturnValue(false);
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(failureEvent()).toBeNull();
  });

  it("stays quiet on a fresh cache hit", async () => {
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: [{ title: "Cached", thumbnailUrl: "t", videoId: "abc" }],
      createdAt: new Date(),
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(failureEvent()).toBeNull();
  });

  it("pages on a spent quota, even when the cache covers for it", async () => {
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(sendQuotaAlertMock).toHaveBeenCalledOnce();
  });

  // One room searching hard trips YouTube's short-window ceiling while the
  // day's allowance is barely touched. Latching the day marker on that told
  // every other room search was gone until midnight — for hours, while it
  // was still answering.
  it("does not page, or write off the day, on a burst ceiling", async () => {
    fetchMock.mockImplementation(async () => burstFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(sendQuotaAlertMock).not.toHaveBeenCalled();
  });

  it("tells a burst apart from a spent day in what the singer is shown", async () => {
    fetchMock.mockImplementation(async () => burstFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    // No `reason: "quota"`, so the client shows its "quick breather" copy
    // rather than a countdown to the Pacific reset.
    expect(res.getStatus()).toBe(503);
    const body = res.getBody() as { reason: string; resetsAt?: string };
    expect(body.reason).toBe("busy");
    expect(body.resetsAt).toBeUndefined();
    expect(res.getHeader("Retry-After")).toBe("30");
  });

  it("records a burst under its own reason, not as a spent quota", async () => {
    fetchMock.mockImplementation(async () => burstFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(failureEvent()).toMatchObject({
      failReason: "youtube_busy",
      searchOutcome: "error",
    });
  });

  it("still serves a stale copy through a burst", async () => {
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async () => burstFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getHeader("x-karaoq-search-cache")).toBe("stale");
    expect(sendQuotaAlertMock).not.toHaveBeenCalled();
  });

  it("does not page when YouTube is merely unreachable", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, false, 500));

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(502);
    expect(sendQuotaAlertMock).not.toHaveBeenCalled();
  });

  it("stays quiet on a successful live search", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a"]));
      if (url.includes("/youtube/v3/videos")) return jsonResponse({ items: [] });
      throw new Error("unexpected fetch " + url);
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(failureEvent()).toBeNull();
  });

  it("attributes the failure to the searching room, uppercased", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "test", roomId: "abcd1" } }), res);

    expect(failureEvent()).toMatchObject({ roomId: "ABCD1" });
  });

  it("drops an implausible roomId to '' instead of storing it", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(
      createMockReq({ query: { q: "test", roomId: "R".repeat(65) } }),
      res
    );

    expect(failureEvent()).toMatchObject({ roomId: "" });
  });
});

describe("GET /api/search — banking a live search into the corpus", () => {
  const song = SONG_SECTIONS[0].categories[0].songs[0];
  const tapped = buildSearchQuery(buildSongQuery(song), true);
  const key = searchCacheKey(tapped);

  function liveSearch() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/youtube/v3/search")) return jsonResponse(searchItems(["a"]));
      if (url.includes("/youtube/v3/videos")) return jsonResponse({ items: [] });
      throw new Error("unexpected fetch " + url);
    });
  }

  it("reads the search cache for a catalogued query like any other", async () => {
    const cached = [{ title: "Cached", thumbnailUrl: "t", videoId: "abc" }];
    mockCollection.findOne.mockResolvedValue({
      key: `${key}|any|relevance`,
      results: cached,
      createdAt: new Date(),
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: tapped } }), res);

    expect(res.getHeader("x-karaoq-search-cache")).toBe("fresh");
    expect(res.getBody()).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("banks a live search under the key the corpus files that song by", async () => {
    liveSearch();

    const res = createRes();
    await handler(createMockReq({ query: { q: tapped } }), res);

    expect(res.getStatus()).toBe(200);
    expect(recordSearchResultsMock).toHaveBeenCalledWith(key, expect.any(Array));
  });

  it("banks under the server's own key, never one a caller supplies", async () => {
    liveSearch();

    const res = createRes();
    await handler(
      createMockReq({ query: { q: tapped, song: "some other song" } }),
      res
    );

    expect(res.getStatus()).toBe(200);
    // The key comes from the query the server normalized, not from the caller.
    expect(recordSearchResultsMock).toHaveBeenCalledWith(key, expect.any(Array));
  });

  it("keys an ordinary query to itself, which is no song at all", async () => {
    liveSearch();

    const res = createRes();
    await handler(
      createMockReq({ query: { q: "my mate dave singing badly" } }),
      res
    );

    expect(recordSearchResultsMock).toHaveBeenCalledWith(
      searchCacheKey("my mate dave singing badly"),
      expect.any(Array)
    );
  });

  it("banks nothing from a filtered search", async () => {
    liveSearch();

    const res = createRes();
    await handler(
      createMockReq({ query: { q: tapped, duration: "short" } }),
      res
    );

    expect(res.getStatus()).toBe(200);
    expect(recordSearchResultsMock).not.toHaveBeenCalled();
  });

  it("banks nothing when the search itself failed", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, false, 500));

    const res = createRes();
    await handler(createMockReq({ query: { q: tapped } }), res);

    expect(recordSearchResultsMock).not.toHaveBeenCalled();
  });

  it("banks nothing from a query that keys to a song but asks for another", async () => {
    liveSearch();
    const crafted = tapped.replace(" ", " -");
    expect(searchCacheKey(crafted)).toBe(key);

    const res = createRes();
    await handler(createMockReq({ query: { q: crafted } }), res);

    expect(res.getStatus()).toBe(200);
    expect(recordSearchResultsMock).not.toHaveBeenCalled();
  });

  it("caches such a query under itself, never under the song it excludes", async () => {
    liveSearch();
    const crafted = tapped.replace(" ", " -");

    const res = createRes();
    await handler(createMockReq({ query: { q: crafted } }), res);

    // Sharing the entry served every room an answer excluding the song.
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
    const written = mockCollection.updateOne.mock.calls.map(
      (call) => (call[0] as { key: string }).key
    );
    expect(written).not.toContain(`${key}|any|relevance`);
    expect(written).toContain(`${crafted.toLowerCase()}|any|relevance`);
  });

  it("answers even when banking rejects", async () => {
    liveSearch();
    recordSearchResultsMock.mockRejectedValue(new Error("write concern"));

    const res = createRes();
    await handler(createMockReq({ query: { q: tapped } }), res);

    expect(res.getStatus()).toBe(200);
  });

  it("banks after answering, and stays alive until the write lands", async () => {
    liveSearch();
    const res = createRes();
    let bodyWhenBanked: unknown = null;
    let land!: () => void;
    recordSearchResultsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          bodyWhenBanked = res.getBody();
          land = () => resolve({ videosUpserted: 0, cutsAdded: 0 });
        })
    );

    let ended = false;
    const done = handler(createMockReq({ query: { q: tapped } }), res).then(() => {
      ended = true;
    });
    await vi.waitFor(() => expect(recordSearchResultsMock).toHaveBeenCalled());

    expect(bodyWhenBanked).not.toBeNull();
    expect(ended).toBe(false);
    land();
    await done;
    expect(ended).toBe(true);
  });
});

describe("riding out a burst ceiling", () => {
  const searchCalls = () =>
    fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/youtube/v3/search")
    ).length;

  const burstBody = {
    error: { message: "Rate limit", errors: [{ reason: "rateLimitExceeded" }] },
  };
  const dailyBody = {
    error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] },
  };

  it("retries once and serves what the second call returns", async () => {
    let searches = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (!String(url).includes("/youtube/v3/search")) {
        return jsonResponse(videoItems(["v1"]));
      }
      searches += 1;
      return searches === 1
        ? jsonResponse(burstBody, false, 429)
        : jsonResponse(searchItems(["v1"]));
    });

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(searchCalls()).toBe(2);
    expect(res.getBody()).toMatchObject([{ videoId: "v1" }]);
  });

  it("gives up after the one retry rather than hammering the ceiling", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(burstBody, false, 429));

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(503);
    expect(searchCalls()).toBe(2);
  });

  it("never retries a spent day, which cannot clear before the reset", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(dailyBody, false, 403));

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    expect(res.getStatus()).toBe(503);
    expect(searchCalls()).toBe(1);
  });
});

describe("recording what YouTube said", () => {
  it("reads a spent day out of the message, and records the message", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        {
          error: {
            status: "RESOURCE_EXHAUSTED",
            message:
              "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'youtube.googleapis.com'.",
          },
        },
        false,
        429
      )
    );

    const res = createRes();
    await handler(createMockReq({ query: { q: "test" } }), res);

    const body = res.getBody() as { reason: string; resetsAt?: string };
    expect(body.reason).toBe("quota");
    expect(body.resetsAt).toBeTruthy();
    expect(sendQuotaAlertMock).toHaveBeenCalled();
    expect(failureEvent()).toMatchObject({ failReason: "quota" });
    expect(String(failureEvent()?.failDetail)).toContain("Queries per day");
  });
});

describe("search demand ledger", () => {
  const quotaFailure = () =>
    jsonResponse(
      { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
      false,
      403
    );

  const freshCache = (results: unknown[]) => ({
    key: "k",
    results,
    createdAt: new Date(),
  });

  it("counts a cache hit as a song wanted, not as one paid for", async () => {
    mockCollection.findOne.mockResolvedValue(
      freshCache([{ title: "Cached", thumbnailUrl: "t", videoId: "c1" }])
    );

    const res = createRes();
    await handler(
      createMockReq({ query: { q: "abba dancing queen karaoke", roomId: "abc12" } }),
      res
    );

    expect(res.getHeader("x-karaoq-search-cache")).toBe("fresh");
    expect(demandWrite()).toMatchObject({
      query: "abba dancing queen karaoke",
      roomId: "ABC12",
      country: "PH",
      outcome: "served",
    });
  });

  it("counts a live search as one of the day's hundred", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(searchItems(["v1"]))
    );

    const res = createRes();
    await handler(createMockReq({ query: { q: "the agadiers mag dungan ta" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(demandWrite()).toMatchObject({ outcome: "spent" });
  });

  it("counts a corpus rescue apart from a search that answered", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());
    readSongCutsMock.mockResolvedValue([
      { title: "A cut", thumbnailUrl: "t", videoId: "c1" },
    ]);

    const res = createRes();
    await handler(createMockReq({ query: { q: "abba dancing queen karaoke" } }), res);

    expect(res.getHeader("x-karaoq-search-cache")).toBe("corpus");
    expect(demandWrite()).toMatchObject({ outcome: "corpus" });
  });

  it("counts an aging cache covering for a spent quota as stale", async () => {
    mockCollection.findOne.mockResolvedValue({
      key: "k",
      results: [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "q" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(demandWrite()).toMatchObject({ outcome: "stale" });
  });

  it("counts a singer who got nothing as unmet demand", async () => {
    fetchMock.mockImplementation(async () => quotaFailure());

    const res = createRes();
    await handler(createMockReq({ query: { q: "unheld song" } }), res);

    expect(res.getStatus()).toBe(503);
    expect(demandWrite()).toMatchObject({ outcome: "error" });
  });

  it("counts nothing for a search we refused to run", async () => {
    // A row is keyed on the query, so counting rejections would let someone
    // holding the limiter down mint a document per request with a fresh string
    // each time — and a search we never made says nothing about the song.
    rateLimitMock.mockReturnValue(false);

    const res = createRes();
    await handler(createMockReq({ query: { q: "some song" } }), res);

    expect(res.getStatus()).toBe(429);
    expect(recordDemandMock).not.toHaveBeenCalled();
  });

  it("writes exactly once per search, whatever the exit", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(searchItems(["v1"])));

    const res = createRes();
    await handler(createMockReq({ query: { q: "one song" } }), res);

    expect(recordDemandMock).toHaveBeenCalledTimes(1);
  });

  it("folds a search made with karaoke mode off onto the same song", async () => {
    const song = SONG_SECTIONS[0].categories[0].songs[0];
    const bare = buildSongQuery(song);
    fetchMock.mockImplementation(async () => jsonResponse(searchItems(["v1"])));

    const res = createRes();
    await handler(createMockReq({ query: { q: bare } }), res);
    const off = demandWrite()?.query as string;

    recordDemandMock.mockClear();
    mockCollection.findOne.mockResolvedValue(null);
    await handler(
      createMockReq({ query: { q: buildSearchQuery(bare, true) } }),
      createRes()
    );
    const on = demandWrite()?.query as string;

    // Two different queries, one song: the ledger keys both on the karaoke-mode
    // form, which is the _id karaoke_songs files that song under.
    expect(off).not.toBe(on);
    expect(demandKey(off)).toBe(demandKey(on));
    expect(demandKey(on)).toBe(searchCacheKey(buildSearchQuery(bare, true)));
  });
});

describe("banking a search that named no song we carry", () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async () => jsonResponse(searchItems(["v1", "v2"])));
  });

  it("keeps what the search already cost, so nobody buys it twice", async () => {
    recordSearchResultsMock.mockResolvedValue({
      videosUpserted: 0,
      cutsAdded: 0,
      songKnown: false,
    });

    const res = createRes();
    await handler(
      createMockReq({ query: { q: "the agadiers mag dungan ta", roomId: "abc12" } }),
      res
    );

    expect(res.getStatus()).toBe(200);
    expect(bankEvidenceMock).toHaveBeenCalledTimes(1);
    expect(bankEvidenceMock.mock.calls[0][1]).toMatchObject({
      roomId: "ABC12",
      country: "PH",
    });
  });

  it("banks nothing when the corpus already carries the song", async () => {
    // recordSearchResults has filed it under that song; a second copy with no
    // songKeys would show up in the curation queue as a song we don't have.
    recordSearchResultsMock.mockResolvedValue({
      videosUpserted: 2,
      cutsAdded: 2,
      songKnown: true,
    });

    await handler(createMockReq({ query: { q: "abba dancing queen karaoke" } }), createRes());

    expect(bankEvidenceMock).not.toHaveBeenCalled();
  });

  it("banks nothing from a filtered search", async () => {
    recordSearchResultsMock.mockResolvedValue({
      videosUpserted: 0,
      cutsAdded: 0,
      songKnown: false,
    });

    await handler(
      createMockReq({ query: { q: "some song", duration: "short" } }),
      createRes()
    );

    // The corpus serves the default combination; another filter's results are
    // answers to a different question.
    expect(recordSearchResultsMock).not.toHaveBeenCalled();
    expect(bankEvidenceMock).not.toHaveBeenCalled();
  });

  it("banks nothing from an operator query", async () => {
    recordSearchResultsMock.mockResolvedValue({
      videosUpserted: 0,
      cutsAdded: 0,
      songKnown: false,
    });

    await handler(
      createMockReq({ query: { q: "abba dancing queen -karaoke" } }),
      createRes()
    );

    expect(bankEvidenceMock).not.toHaveBeenCalled();
  });

  it("still answers the singer when the banking write fails", async () => {
    recordSearchResultsMock.mockRejectedValue(new Error("Atlas failover"));

    const res = createRes();
    await handler(createMockReq({ query: { q: "some song" } }), res);

    expect(res.getStatus()).toBe(200);
    expect(bankEvidenceMock).not.toHaveBeenCalled();
  });
});
