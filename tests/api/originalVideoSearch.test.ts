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

const bankMock = vi.fn();
vi.mock("../../lib/songCorpus", () => ({
  bankSearchEvidence: (...args: unknown[]) => bankMock(...args),
  recordSearchResults: (...args: unknown[]) => bankMock(...args),
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

import handler from "../../pages/api/queue/[id]/original-video-search";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader() { return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => any };
}

const RESULTS = [
  { videoId: "aaaaaaaaaaa", title: "Bad Romance (Live at the Grammys)", thumbnailUrl: "", durationSeconds: 300 },
  { videoId: "bbbbbbbbbbb", title: "Bad Romance Karaoke", thumbnailUrl: "" },
];

function req(q: string | undefined, id = "ROOM1") {
  return createMockReq({ method: "GET", query: { id, ...(q === undefined ? {} : { q }) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(rateLimitAllowed).forEach((k) => delete rateLimitAllowed[k]);
  searchQuotaSpentMock.mockResolvedValue(false);
  confirmDailyOutMock.mockImplementation(async (limit) => limit === "daily");
  mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  mockCollection.findOne.mockImplementation(async (filter: Record<string, unknown>) =>
    "id" in filter ? (filter.id === "ROOM1" ? { _id: "x" } : null) : null
  );
  searchYoutubeApiMock.mockResolvedValue(RESULTS);
});

describe("GET /api/queue/[id]/original-video-search", () => {
  it.each([[undefined], ["a"], ["x".repeat(121)]])("400s a bad query %j", async (q) => {
    const res = createRes();
    await handler(req(q as string | undefined), res);
    expect(res.getStatus()).toBe(400);
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("404s an unknown room without searching", async () => {
    const res = createRes();
    await handler(req("bad romance live", "NOPE1"), res);
    expect(res.getStatus()).toBe(404);
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("returns what the host asked for, karaoke cuts included, and never feeds the corpus", async () => {
    const res = createRes();
    await handler(req("bad romance live"), res);
    expect(res.getStatus()).toBe(200);
    expect(res.getBody().status).toBe("ok");
    expect(res.getBody().candidates.map((c: { videoId: string }) => c.videoId)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(res.getBody().candidates[0].durationSeconds).toBe(300);
    expect(recordSpendMock).toHaveBeenCalledTimes(1);
    expect(bankMock).not.toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalledWith(expect.anything(), "original_video_searched", { roomId: "ROOM1", source: "live" });
  });

  it("answers quota without searching when the day is spent", async () => {
    searchQuotaSpentMock.mockResolvedValue(true);
    const res = createRes();
    await handler(req("bad romance live"), res);
    expect(res.getBody().status).toBe("quota");
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("draws on the singers' shared search bucket", async () => {
    rateLimitAllowed["search"] = false;
    const res = createRes();
    await handler(req("bad romance live"), res);
    expect(res.getBody().status).toBe("busy");
    expect(searchYoutubeApiMock).not.toHaveBeenCalled();
  });

  it("429s past its own rate limit", async () => {
    rateLimitAllowed["original-video-search"] = false;
    const res = createRes();
    await handler(req("bad romance live"), res);
    expect(res.getStatus()).toBe(429);
  });

  it("maps a daily-quota refusal to quota", async () => {
    searchYoutubeApiMock.mockRejectedValue(new YoutubeApiError("quota", "daily", "quotaExceeded"));
    const res = createRes();
    await handler(req("bad romance live"), res);
    expect(res.getBody().status).toBe("quota");
  });
});
