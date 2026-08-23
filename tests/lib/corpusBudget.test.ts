import { describe, it, expect } from "vitest";
import { ledgerDay, remaining } from "../../lib/corpusBudget";

// vercel.json fires the two cron slots at 07:15 and 08:15 UTC, which straddle
// the 08:00 UTC quota reset in PST. A UTC ledger put both on one day, so the
// slot that fired minutes after the refill read the day as already spent.
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
