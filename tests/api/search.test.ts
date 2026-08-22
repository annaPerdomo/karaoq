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

const recordSearchResultsMock = vi.fn(async (..._args: unknown[]) => ({
  videosUpserted: 0,
  cutsAdded: 0,
}));
vi.mock("../../lib/songCorpus", () => ({
  recordSearchResults: (...args: unknown[]) => recordSearchResultsMock(...args),
}));

const sendQuotaAlertMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/alerts", () => ({
  sendQuotaAlertOnce: (...args: unknown[]) => sendQuotaAlertMock(...args),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(true);
  markNotifiedMock.mockReturnValue(true);
  recordSearchResultsMock.mockResolvedValue({ videosUpserted: 0, cutsAdded: 0 });
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
    // Folding out punctuation orphaned every entry holding an apostrophe, so
    // the day after the change would re-buy results already in Mongo.
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
    // ...and re-filed under the new key, so the next hit is a plain one.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { key: `${searchCacheKey(q)}|any|relevance` },
      expect.anything(),
      expect.anything()
    );
  });

  it("won't launder a stale legacy entry into a fresh one", async () => {
    // Re-keying restarts the age clock, so only a still-fresh copy is moved.
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

    // A live search ran, and nothing was written under the new key beforehand.
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
      if (url.includes("/youtube/v3/videos")) return jsonResponse({ items: [] });
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
      // "b" had no videos.list row — passes through un-enriched.
      { title: "Song b", thumbnailUrl: "https://i.ytimg.com/vi/b/mq.jpg", videoId: "b" },
    ]);
    // writeCache is fire-and-forget; give its promise chain a tick to land.
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
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
    // The normalized form is also what gets searched — "karaoke karaoke"
    // queried worse, not just cached twice.
    const searchUrl = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/search")
    )![0] as string;
    // URLSearchParams spells spaces as "+". Casing is the singer's; only the
    // cache key is lowercased.
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
    // The singer who typed "beyonce halo" gets a cache hit instead of another
    // of the day's ~100 live searches.
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      key: "beyonce halo|any|relevance",
    });
    // ...while YouTube still gets the accents and punctuation, which help it.
    const searchUrl = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/search")
    )![0] as string;
    // URLSearchParams spelling: "+" for spaces, %C3%A9 for the é.
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

    // An older client's stacked suffix keys the same entry as a current one's
    // "abba karaoke live" — one intent, one of the day's ~90 searches.
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
    // Wait for the leader to reach YouTube, so its in-flight entry exists...
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes("/search"))
      ).toHaveLength(1)
    );

    const res2 = createRes();
    const second = handler(createMockReq({ query: { q: "Same  Song" } }), res2);
    // ...and let the follower get past its own cache read to the ride-along.
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
  // Exactly what a tap that fell through to search still sends.
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
    // Recognition stays server-side: the key comes from the query we normalized,
    // so nothing a caller sends can name a song (see recordSearchResults).
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
    // Cuts are the unfiltered answer; a "short" set would rewrite every room's.
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
    // The fold turns " -" into one space, so this reaches the corpus as the song
    // it tells YouTube to leave out — and cuts are never overwritten.
    const crafted = tapped.replace(" ", " -");
    expect(searchCacheKey(crafted)).toBe(key);

    const res = createRes();
    await handler(createMockReq({ query: { q: crafted } }), res);

    expect(res.getStatus()).toBe(200);
    expect(recordSearchResultsMock).not.toHaveBeenCalled();
  });

  it("answers even when banking rejects", async () => {
    liveSearch();
    // A singer waiting on results must never be failed by our bookkeeping.
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

    // Answered first, so the bank costs the singer nothing — but awaited, since
    // a dropped promise dies with the frozen instance mid-write.
    expect(bodyWhenBanked).not.toBeNull();
    expect(ended).toBe(false);
    land();
    await done;
    expect(ended).toBe(true);
  });
});
