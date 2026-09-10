import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();

function collection(name: string): FakeCollection {
  if (!collections.has(name)) collections.set(name, fakeCollection());
  return collections.get(name)!;
}

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => collection(name),
        command: vi.fn(async () => ({})),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import {
  acquireRun,
  estimateUnits,
  ledgerDay,
  recordSpend,
  releaseRun,
  remaining,
  spentRecent,
} from "../../lib/corpusBudget";

const state = () => collection("cron_state");
const MINUTE = 60_000;

beforeEach(() => {
  collections.clear();
});

// vercel.json fires the two cron slots at 07:15 and 08:15 UTC, straddling the
// 08:00 UTC quota reset in PST. A UTC ledger put both on one day.
describe("ledgerDay", () => {
  it("rolls over with YouTube's Pacific reset, not UTC midnight", () => {
    const before = Date.parse("2026-01-15T07:15:00Z");
    const after = Date.parse("2026-01-15T08:15:00Z");

    expect(ledgerDay(before)).toBe("2026-01-14");
    expect(ledgerDay(after)).toBe("2026-01-15");
  });

  it("keeps both PDT slots on the day their quota came from", () => {
    const first = Date.parse("2026-07-15T07:15:00Z");
    const second = Date.parse("2026-07-15T08:15:00Z");

    expect(ledgerDay(first)).toBe("2026-07-15");
    expect(ledgerDay(second)).toBe("2026-07-15");
  });

  it("never hands back more than the allowance or less than nothing", () => {
    expect(remaining(40, 0)).toBe(40);
    expect(remaining(40, 40)).toBe(0);
    expect(remaining(40, 99)).toBe(0);
  });
});

describe("the run lease", () => {
  it("hands the lock to one run and turns the overlapping slot away", async () => {
    const at = Date.now();

    expect(await acquireRun(at)).toEqual(expect.any(String));
    expect(await acquireRun(at + MINUTE)).toBeNull();
  });

  it("lets the next slot in once the run before it released", async () => {
    const at = Date.now();
    const held = (await acquireRun(at))!;
    await releaseRun(at + MINUTE, held);

    expect(await acquireRun(at + 2 * MINUTE)).toEqual(expect.any(String));
  });

  it("lets a run that overran be taken over, lease and all", async () => {
    const at = Date.now();
    await acquireRun(at);

    // Six minutes outlives the function, so a lease still held here belongs to a
    // run the platform already killed.
    expect(await acquireRun(at + 7 * MINUTE)).toEqual(expect.any(String));
  });

  it("leaves the lease of the run that took over alone", async () => {
    const at = Date.now();
    const overran = (await acquireRun(at))!;
    const taken = (await acquireRun(at + 7 * MINUTE))!;

    await releaseRun(at + 8 * MINUTE, overran);

    expect(taken).not.toBe(overran);
    // Released unconditionally, this freed the lock a working run held.
    expect(await acquireRun(at + 9 * MINUTE)).toBeNull();
    expect(state().get("run").leaseToken).toBe(taken);
  });
});

describe("spentRecent", () => {
  it("reads the last week oldest first, zero-filling days nothing billed", async () => {
    const at = Date.parse("2026-09-10T20:00:00Z");
    await recordSpend(at, { searches: 3, cronSearches: 1 });
    await recordSpend(at - 2 * 24 * 60 * MINUTE, { searches: 7, lookups: 2 });

    const days = await spentRecent(at, 3);

    expect(days.map((d) => d.day)).toEqual(["2026-09-08", "2026-09-09", "2026-09-10"]);
    expect(days[0]).toMatchObject({ searches: 7, cronSearches: 0, lookups: 2 });
    expect(days[1]).toMatchObject({ searches: 0, cronSearches: 0, pages: 0, lookups: 0 });
    expect(days[2]).toMatchObject({ searches: 3, cronSearches: 1 });
  });

  it("walks back over the 23-hour spring-forward day without skipping it", async () => {
    // 00:30 PDT on Mar 9, 2026; 24 clock hours earlier is still Mar 7.
    const at = Date.parse("2026-03-09T07:30:00Z");

    const days = await spentRecent(at, 3);

    expect(days.map((d) => d.day)).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
  });
});

describe("estimateUnits", () => {
  it("bills a search at 100 plus its videos.list enrichment, everything else at 1", () => {
    expect(estimateUnits({ searches: 2, cronSearches: 1, pages: 30, lookups: 4 })).toBe(236);
    expect(estimateUnits({ searches: 0, cronSearches: 0, pages: 0, lookups: 0 })).toBe(0);
  });
});
