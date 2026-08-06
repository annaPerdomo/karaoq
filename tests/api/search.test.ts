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
vi.mock("../../lib/limits", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.YOUTUBE_API_KEY = "test-key";

import handler from "../../pages/api/search";

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

  it("re-searches a stale entry and refreshes it when YouTube answers", async () => {
    const stale = [{ title: "Stale", thumbnailUrl: "t", videoId: "old" }];
    mockCollection.findOne.mockResolvedValue({
      key: "q|any|relevance",
      results: stale,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
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
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
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
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
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

  it("requests 25 results and enriches them with duration and view count", async () => {
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
    expect(searchUrl).toContain("maxResults=25");

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
});
