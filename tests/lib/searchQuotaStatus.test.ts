import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFindOne = vi.fn();
const mockCreateIndex = vi.fn().mockResolvedValue("ok");

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({
          findOne: mockFindOne,
          createIndex: mockCreateIndex,
        }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import {
  resetSearchQuotaStatusCache,
  searchQuotaResetsAt,
} from "../../lib/searchQuotaStatus";

beforeEach(() => {
  vi.clearAllMocks();
  resetSearchQuotaStatusCache(); // module state, so it outlives clearAllMocks
  mockFindOne.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("searchQuotaResetsAt", () => {
  it("returns the reset time while today's marker doc exists", async () => {
    mockFindOne.mockResolvedValue({ _id: "quota-out:x", sentAt: new Date() });

    const resetsAt = await searchQuotaResetsAt();

    expect(resetsAt).not.toBeNull();
    expect(new Date(resetsAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null while search is fine", async () => {
    expect(await searchQuotaResetsAt()).toBeNull();
  });

  it("accepts the pre-marker alert doc too, so an old trip still counts", async () => {
    await searchQuotaResetsAt();

    const filter = mockFindOne.mock.calls[0][0] as { _id: { $in: string[] } };
    expect(filter._id.$in).toHaveLength(2);
    expect(filter._id.$in[0]).toMatch(/^quota-out:\d{4}-\d{2}-\d{2}$/);
    expect(filter._id.$in[1]).toMatch(/^quota:\d{4}-\d{2}-\d{2}$/);
  });

  it("memoizes the read within the cache window", async () => {
    await searchQuotaResetsAt();
    await searchQuotaResetsAt();
    await searchQuotaResetsAt();

    expect(mockFindOne).toHaveBeenCalledOnce();
  });

  it("clears itself the moment the Pacific day flips", async () => {
    vi.useFakeTimers();
    // 23:59:50 Pacific (PDT = UTC-7): quota is out, cache fills.
    vi.setSystemTime(new Date("2026-08-23T06:59:50Z"));
    mockFindOne.mockResolvedValue({ _id: "quota-out:x", sentAt: new Date() });
    expect(await searchQuotaResetsAt()).not.toBeNull();

    // 00:00:10 Pacific, 20s later — inside the age TTL, so only the day key
    // can force the re-read that clears the flag.
    vi.setSystemTime(new Date("2026-08-23T07:00:10Z"));
    mockFindOne.mockResolvedValue(null);
    expect(await searchQuotaResetsAt()).toBeNull();
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });

  it("never throws on a Mongo failure — the room poll must survive", async () => {
    mockFindOne.mockRejectedValue(new Error("mongo down"));

    await expect(searchQuotaResetsAt()).resolves.toBeNull();
  });

  it("keeps serving the same-day cached answer through a Mongo blip", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T04:00:00Z")); // 21:00 Pacific
    mockFindOne.mockResolvedValue({ _id: "quota-out:x", sentAt: new Date() });
    expect(await searchQuotaResetsAt()).not.toBeNull();

    // Past the TTL but the same evening: the refresh fails, and the stale
    // same-day answer beats guessing.
    vi.setSystemTime(new Date("2026-08-23T04:01:00Z"));
    mockFindOne.mockRejectedValue(new Error("mongo down"));
    expect(await searchQuotaResetsAt()).not.toBeNull();
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });
});
