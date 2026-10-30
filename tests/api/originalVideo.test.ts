import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { YoutubeApiError } from "../../lib/youtubeApi";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  insertOne: vi.fn(),
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

const rateLimitAllowed: Record<string, boolean> = {};
const rateLimitMock = vi.fn((_req: unknown, scope: string) => rateLimitAllowed[scope] ?? true);
vi.mock("../../lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/limits")>()),
  rateLimit: (...args: Parameters<typeof rateLimitMock>) => rateLimitMock(...args),
}));

const trackEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const lookupCorpusSongMock = vi.fn(async (..._args: unknown[]) => null as unknown);
vi.mock("../../lib/originalVideoLookup", () => ({
  lookupCorpusSong: (...args: unknown[]) => lookupCorpusSongMock(...args),
}));

const searchQuotaSpentMock = vi.fn(async () => false);
const confirmDailyOutMock = vi.fn(async (limit: string | null) => limit === "daily");
vi.mock("../../lib/searchQuotaStatus", () => ({
  searchQuotaSpent: () => searchQuotaSpentMock(),
  confirmDailyOut: (limit: string | null) => confirmDailyOutMock(limit),
}));

const searchYoutubeApiMock = vi.fn(async (..._args: unknown[]) => [] as unknown[]);
vi.mock("../../lib/youtubeSearch", () => ({
  searchYoutubeApi: (...args: unknown[]) => searchYoutubeApiMock(...args),
}));

const recordSpendMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/corpusBudget", () => ({
  recordSpend: (...args: unknown[]) => recordSpendMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/queue/[id]/original-video";

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

const roomDoc = {
  id: "ROOM1",
  activeVideoIndex: 0,
  queue: [
    { id: "e0", userName: "Ann", songTitle: "Queen - Bohemian Rhapsody (Karaoke Version)", videoId: "abc0" },
    { id: "e1", userName: "Bea", songTitle: "Queen - Bohemian Rhapsody (Karaoke Version)", videoId: "abc1" },
    { id: "e2", userName: "Cal", songTitle: "Queen - Bohemian Rhapsody (Karaoke Version)", videoId: "abc2" },
  ],
};

function mockRoomFindOne(room: unknown = roomDoc) {
  mockCollection.findOne.mockImplementation(async (filter: Record<string, unknown>) => {
    if ("id" in filter) return filter.id === "ROOM1" ? room : null;
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(rateLimitAllowed).forEach((k) => delete rateLimitAllowed[k]);
  searchQuotaSpentMock.mockResolvedValue(false);
  confirmDailyOutMock.mockImplementation(async (limit) => limit === "daily");
  lookupCorpusSongMock.mockResolvedValue(null);
  mockRoomFindOne();
});

function req(entryId = "e0", query: Record<string, string> = {}) {
  return createMockReq({ method: "GET", query: { id: "ROOM1", entryId, ...query } });
}

describe("GET /api/queue/[id]/original-video", () => {
  it("404s on an unknown entryId without spending a search", async () => {
    const res = createRes();
    await handler(req("nope"), res);

    expect(res.getStatus()).toBe(404);
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("404s an entry that isn't on stage or up next, without spending a search", async () => {
    const res = createRes();
    await handler(req("e2"), res);

    expect(res.getStatus()).toBe(404);
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("resolves the entry that is up next, not just the active one", async () => {
    searchYoutubeApiMock.mockResolvedValue([
      { title: "Queen - Bohemian Rhapsody (Official Video)", thumbnailUrl: "t", videoId: "v1" },
    ]);

    const res = createRes();
    await handler(req("e1"), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "ok", videoIds: ["v1"] });
  });

  it("serves a cache hit without a live call", async () => {
    mockCollection.findOne.mockImplementation(async (filter: Record<string, unknown>) => {
      if ("id" in filter) return roomDoc;
      if ("key" in filter) {
        return {
          key: filter.key,
          results: [
            { title: "Queen - Bohemian Rhapsody (Official Video)", thumbnailUrl: "t", videoId: "v1" },
          ],
          createdAt: new Date(),
        };
      }
      return null;
    });

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "ok", videoIds: ["v1"] });
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("namespaces the cache key away from search.ts's own keys", async () => {
    await handler(req(), createRes());

    const call = mockCollection.findOne.mock.calls.find((args) => "key" in (args[0] as object));
    expect((call?.[0] as { key: string }).key).toMatch(/^original:/);
  });

  it("reports quota on a cache miss with the day's search quota spent", async () => {
    searchQuotaSpentMock.mockResolvedValue(true);

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "quota", videoIds: [] });
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("runs one live search on a cache miss, caches it, and bills the spend", async () => {
    searchYoutubeApiMock.mockResolvedValue([
      { title: "Queen - Bohemian Rhapsody (Official Video)", thumbnailUrl: "t", videoId: "v1" },
    ]);

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "ok", videoIds: ["v1"] });
    expect(searchYoutubeApiMock).toHaveBeenCalledTimes(1);
    expect(recordSpendMock).toHaveBeenCalledWith(expect.any(Number), { searches: 1 });
    await vi.waitFor(() => expect(mockCollection.updateOne).toHaveBeenCalled());
  });

  it("reports none when every live result is a karaoke title", async () => {
    searchYoutubeApiMock.mockResolvedValue([
      { title: "Queen - Bohemian Rhapsody (Karaoke Version)", thumbnailUrl: "t", videoId: "v1" },
    ]);

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "none", videoIds: [] });
  });

  it("429s a request over its own rate limit", async () => {
    rateLimitAllowed["original-video"] = false;

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(429);
  });

  it("reports busy, not 429, when the shared search bucket is exhausted", async () => {
    rateLimitAllowed["search"] = false;

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "busy", videoIds: [] });
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("404s on an unknown room", async () => {
    const res = createRes();
    await handler(req("e0", { id: "NOPE1" }), res);

    expect(res.getStatus()).toBe(404);
  });

  it("405s a non-GET method", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "POST", query: { id: "ROOM1" } }), res);

    expect(res.getStatus()).toBe(405);
  });

  it("coalesces concurrent misses into one live call", async () => {
    let releaseSearch!: (results: unknown[]) => void;
    searchYoutubeApiMock.mockImplementation(
      () => new Promise((resolve) => { releaseSearch = resolve; })
    );

    const res1 = createRes();
    const first = handler(req(), res1);
    await vi.waitFor(() => expect(searchYoutubeApiMock).toHaveBeenCalledTimes(1));

    const res2 = createRes();
    const second = handler(req(), res2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    releaseSearch([{ title: "Queen - Bohemian Rhapsody (Official Video)", thumbnailUrl: "t", videoId: "v1" }]);
    await Promise.all([first, second]);

    expect(searchYoutubeApiMock).toHaveBeenCalledTimes(1);
    expect(res1.getBody()).toEqual({ status: "ok", videoIds: ["v1"] });
    expect(res2.getBody()).toEqual(res1.getBody());
  });
});

describe("error classification", () => {
  it("reports quota on a daily refusal, confirmed against the ledger", async () => {
    searchYoutubeApiMock.mockRejectedValue(
      new YoutubeApiError("quota", "daily", "quotaExceeded")
    );

    const res = createRes();
    await handler(req(), res);

    expect(confirmDailyOutMock).toHaveBeenCalledWith("daily");
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "quota", videoIds: [] });
  });

  it("reports busy on a burst ceiling that survives the retry", async () => {
    searchYoutubeApiMock.mockRejectedValue(
      new YoutubeApiError("burst", "burst", "rateLimitExceeded")
    );

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "busy", videoIds: [] });
  });

  it("502s an upstream failure that is not a quota error", async () => {
    searchYoutubeApiMock.mockRejectedValue(new Error("upstream down"));

    const res = createRes();
    await handler(req(), res);

    expect(res.getStatus()).toBe(502);
  });
});

describe("original_video_resolved analytics", () => {
  function sourceOf(): unknown {
    const call = trackEventMock.mock.calls.find((args) => args[1] === "original_video_resolved");
    return (call?.[2] as Record<string, unknown> | undefined)?.source;
  }

  it("tracks source \"cache\" on a cache hit", async () => {
    mockCollection.findOne.mockImplementation(async (filter: Record<string, unknown>) => {
      if ("id" in filter) return roomDoc;
      if ("key" in filter) {
        return {
          key: filter.key,
          results: [
            { title: "Queen - Bohemian Rhapsody (Official Video)", thumbnailUrl: "t", videoId: "v1" },
          ],
          createdAt: new Date(),
        };
      }
      return null;
    });

    await handler(req(), createRes());

    expect(sourceOf()).toBe("cache");
  });

  it("tracks source \"live\" on a live search", async () => {
    searchYoutubeApiMock.mockResolvedValue([
      { title: "Queen - Bohemian Rhapsody (Official Video)", thumbnailUrl: "t", videoId: "v1" },
    ]);

    await handler(req(), createRes());

    expect(sourceOf()).toBe("live");
  });

  it("tracks source \"quota\" when the day's search quota is spent", async () => {
    searchQuotaSpentMock.mockResolvedValue(true);

    await handler(req(), createRes());

    expect(sourceOf()).toBe("quota");
  });

  it("tracks source \"busy\" when the shared search bucket is exhausted", async () => {
    rateLimitAllowed["search"] = false;

    await handler(req(), createRes());

    expect(sourceOf()).toBe("busy");
  });

  it("tracks source \"none\" when the title is only noise", async () => {
    mockCollection.findOne.mockImplementation(async (filter: Record<string, unknown>) => {
      if ("id" in filter) {
        return {
          ...roomDoc,
          queue: [{ ...roomDoc.queue[0], songTitle: "Karaoke Instrumental" }],
        };
      }
      return null;
    });

    await handler(req(), createRes());

    expect(sourceOf()).toBe("none");
  });
});
