import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });
const mockCreateIndex = vi.fn().mockResolvedValue("ok");

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({
          findOne: mockFindOne,
          updateOne: mockUpdateOne,
          createIndex: mockCreateIndex,
        }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import {
  confirmDailyOut,
  dayQuota,
  resetSearchQuotaStatusCache,
  searchQuotaResetsAt,
} from "../../lib/searchQuotaStatus";

/** Today's ledger doc as the status read sees it (lib/corpusBudget). */
function ledger(spent: {
  searches: number;
  pages?: number;
  lookups?: number;
  dailyOutAt?: Date;
}) {
  return { _id: "budget:x", cronSearches: 0, pages: 0, lookups: 0, ...spent };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSearchQuotaStatusCache(); // module state, so it outlives clearAllMocks
  mockFindOne.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("searchQuotaResetsAt", () => {
  it("returns the reset time once YouTube's daily refusal is confirmed", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 4750, dailyOutAt: new Date() }));

    const resetsAt = await searchQuotaResetsAt();

    expect(resetsAt).not.toBeNull();
    expect(new Date(resetsAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null while search is fine", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 4000, pages: 126, lookups: 5 }));
    expect(await searchQuotaResetsAt()).toBeNull();
  });

  it("returns null with no ledger doc yet today", async () => {
    expect(await searchQuotaResetsAt()).toBeNull();
  });

  it("reads today's ledger doc", async () => {
    await searchQuotaResetsAt();

    const filter = mockFindOne.mock.calls[0][0] as { _id: string };
    expect(filter._id).toMatch(/^budget:\d{4}-\d{2}-\d{2}$/);
  });

  it("stays null when the ledger is spent but YouTube never refused", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 4750 }));
    expect(await searchQuotaResetsAt()).toBeNull();
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
    mockFindOne.mockResolvedValue(ledger({ searches: 4750, dailyOutAt: new Date() }));
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
    mockFindOne.mockResolvedValue(ledger({ searches: 4750, dailyOutAt: new Date() }));
    expect(await searchQuotaResetsAt()).not.toBeNull();

    // Past the TTL but the same evening: the refresh fails, and the stale
    // same-day answer beats guessing.
    vi.setSystemTime(new Date("2026-08-23T04:01:00Z"));
    mockFindOne.mockRejectedValue(new Error("mongo down"));
    expect(await searchQuotaResetsAt()).not.toBeNull();
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });
});

describe("confirmDailyOut", () => {
  it("disbelieves a 'per day' refusal the ledger says came early", async () => {
    // 100 searches spent leaves 9,300 calls of headroom — nowhere near the line.
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));
    expect(await confirmDailyOut("daily")).toBe(false);
  });

  it("confirms one the ledger agrees with and marks the day out", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 4750 }));
    expect(await confirmDailyOut("daily")).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalledOnce();
    expect(mockUpdateOne.mock.calls[0][1]).toMatchObject({
      $set: { dailyOutAt: expect.any(Date) },
    });
  });

  it("marks the day out only once", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 4750, dailyOutAt: new Date() }));
    expect(await confirmDailyOut("daily")).toBe(true);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("believes one within the ledger's unbilled slack and bills the gap", async () => {
    // A full day reads a search or two under Google's console: the sweep's
    // videos.list calls and searches that failed after the call are unbilled.
    mockFindOne.mockResolvedValue(ledger({ searches: 4749 }));
    expect(await confirmDailyOut("daily")).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalledTimes(2);
    expect(mockUpdateOne.mock.calls[0][1]).toMatchObject({ $inc: { searches: 1 } });

    // ...so the status memo says out.
    expect(await searchQuotaResetsAt()).not.toBeNull();
  });

  it("still disbelieves one just outside the slack", async () => {
    // 4,599 searches is 9,198 calls, 302 left — just past the 300-call slack.
    mockFindOne.mockResolvedValue(ledger({ searches: 4599 }));
    expect(await confirmDailyOut("daily")).toBe(false);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("believes one inside the slack", async () => {
    // 4,600 searches is 9,200 calls, 300 left — right at the slack's edge.
    mockFindOne.mockResolvedValue(ledger({ searches: 4600 }));
    expect(await confirmDailyOut("daily")).toBe(true);
  });

  it("never confirms a burst ceiling or an unknown error", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 4750 }));
    expect(await confirmDailyOut("burst")).toBe(false);
    expect(await confirmDailyOut(null)).toBe(false);
  });

  it("takes YouTube's word when the ledger can't be read", async () => {
    mockFindOne.mockRejectedValue(new Error("mongo down"));
    expect(await confirmDailyOut("daily")).toBe(true);
  });

  it("reads the ledger fresh rather than the memoized status", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 10 }));
    expect(await searchQuotaResetsAt()).toBeNull();
    mockFindOne.mockResolvedValue(ledger({ searches: 4750 }));
    expect(await confirmDailyOut("daily")).toBe(true);
    // ...and the status memo follows it.
    expect(await searchQuotaResetsAt()).not.toBeNull();
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });
});

describe("dayQuota", () => {
  it("ignores SUGGESTION_DAY_QUOTA and returns the default call quota", () => {
    process.env.SUGGESTION_DAY_QUOTA = "3000";
    try {
      expect(dayQuota()).toBe(9500);
    } finally {
      delete process.env.SUGGESTION_DAY_QUOTA;
    }
  });

  it("reads YOUTUBE_DAY_CALLS when set", () => {
    process.env.YOUTUBE_DAY_CALLS = "8000";
    try {
      expect(dayQuota()).toBe(8000);
    } finally {
      delete process.env.YOUTUBE_DAY_CALLS;
    }
  });

  it("ignores a non-numeric or negative override", () => {
    process.env.YOUTUBE_DAY_CALLS = "abc";
    try {
      expect(dayQuota()).toBe(9500);
    } finally {
      delete process.env.YOUTUBE_DAY_CALLS;
    }
    process.env.YOUTUBE_DAY_CALLS = "-5";
    try {
      expect(dayQuota()).toBe(9500);
    } finally {
      delete process.env.YOUTUBE_DAY_CALLS;
    }
  });
});
