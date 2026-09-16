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
  resetSearchQuotaStatusCache,
  searchQuotaResetsAt,
} from "../../lib/searchQuotaStatus";

/** Today's ledger doc as the status read sees it (lib/corpusBudget). */
function ledger(spent: { searches: number; pages?: number; lookups?: number }) {
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
  it("returns the reset time once the ledger can't afford another search", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));

    const resetsAt = await searchQuotaResetsAt();

    expect(resetsAt).not.toBeNull();
    expect(new Date(resetsAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null while search is fine", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 85, pages: 126, lookups: 5 }));
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

  it("counts harvest pages and lookups against the last search", async () => {
    // 98 searches is 9,898 units; 131 more leaves less than one search's worth.
    mockFindOne.mockResolvedValue(ledger({ searches: 98, pages: 126, lookups: 5 }));
    expect(await searchQuotaResetsAt()).not.toBeNull();
  });

  it("honours the SUGGESTION_DAY_QUOTA override", async () => {
    process.env.SUGGESTION_DAY_QUOTA = "150";
    try {
      mockFindOne.mockResolvedValue(ledger({ searches: 120 }));
      expect(await searchQuotaResetsAt()).toBeNull();
    } finally {
      delete process.env.SUGGESTION_DAY_QUOTA;
    }
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
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));
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
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));
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
    // 2026-09-14: YouTube said the day was out at 85 searches, then served
    // nine more.
    mockFindOne.mockResolvedValue(ledger({ searches: 85, pages: 126, lookups: 5 }));
    expect(await confirmDailyOut("daily")).toBe(false);
  });

  it("confirms one the ledger agrees with", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));
    expect(await confirmDailyOut("daily")).toBe(true);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("believes one within the ledger's unbilled slack and bills the gap", async () => {
    // A full day reads a search or two under Google's console: the sweep's
    // videos.list calls and searches that failed after the call are unbilled.
    mockFindOne.mockResolvedValue(ledger({ searches: 98 }));
    expect(await confirmDailyOut("daily")).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalledOnce();
    expect(mockUpdateOne.mock.calls[0][1]).toMatchObject({ $inc: { searches: 1 } });

    // ...so the status memo and the next fresh read both say out.
    expect(await searchQuotaResetsAt()).not.toBeNull();
  });

  it("still disbelieves one a few searches out", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 96 }));
    expect(await confirmDailyOut("daily")).toBe(false);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("never confirms a burst ceiling or an unknown error", async () => {
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));
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
    mockFindOne.mockResolvedValue(ledger({ searches: 100 }));
    expect(await confirmDailyOut("daily")).toBe(true);
    // ...and the status memo follows it.
    expect(await searchQuotaResetsAt()).not.toBeNull();
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });
});
