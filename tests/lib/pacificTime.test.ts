import { describe, it, expect } from "vitest";
import { pacificDayKey, quotaResetsAt } from "../../lib/pacificTime";

/** Pacific wall-clock reading of an instant, e.g. "2026-11-02 00:00:00". */
function pacific(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Los_Angeles",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}

describe("pacificDayKey", () => {
  it("names the day in ISO order", () => {
    expect(pacificDayKey(new Date("2026-08-07T19:00:00Z"))).toBe("2026-08-07");
  });

  it("still reads as yesterday when UTC has already rolled over", () => {
    // 02:00 UTC on the 8th is 19:00 Pacific on the 7th — the quota day the
    // singer is actually burning.
    expect(pacificDayKey(new Date("2026-08-08T02:00:00Z"))).toBe("2026-08-07");
  });

  it("rolls over at Pacific midnight, not UTC midnight", () => {
    expect(pacificDayKey(new Date("2026-08-08T06:59:00Z"))).toBe("2026-08-07");
    expect(pacificDayKey(new Date("2026-08-08T07:01:00Z"))).toBe("2026-08-08");
  });

  it("tracks the standard-time offset in winter", () => {
    // PST is UTC-8, so the boundary sits an hour later than in summer.
    expect(pacificDayKey(new Date("2026-01-08T07:59:00Z"))).toBe("2026-01-07");
    expect(pacificDayKey(new Date("2026-01-08T08:01:00Z"))).toBe("2026-01-08");
  });
});

describe("quotaResetsAt", () => {
  it("lands on the next Pacific midnight", () => {
    // 12:00 PDT on the 7th → 00:00 PDT on the 8th.
    expect(pacific(quotaResetsAt(new Date("2026-08-07T19:00:00Z")))).toBe(
      "2026-08-08 00:00:00"
    );
  });

  it("still lands a full day out from just after midnight", () => {
    expect(pacific(quotaResetsAt(new Date("2026-08-07T07:00:01Z")))).toBe(
      "2026-08-08 00:00:00"
    );
  });

  it("survives the 25-hour day when Pacific falls back", () => {
    // 00:30 PDT on Nov 1. Adding the seconds left in the day would land on
    // 23:00 the *same* Pacific day — an hour before the quota actually resets.
    expect(pacific(quotaResetsAt(new Date("2026-11-01T07:30:00Z")))).toBe(
      "2026-11-02 00:00:00"
    );
  });

  it("survives the 23-hour day when Pacific springs forward", () => {
    // 00:30 PST on Mar 8; the naive arithmetic overshoots to 01:00 on the 9th.
    expect(pacific(quotaResetsAt(new Date("2026-03-08T08:30:00Z")))).toBe(
      "2026-03-09 00:00:00"
    );
  });

  it("lands in the future, within a day and a bit", () => {
    const resetsAt = new Date(quotaResetsAt()).getTime();
    expect(resetsAt).toBeGreaterThan(Date.now());
    // A Pacific day runs to 25 hours on the fall-back transition.
    expect(resetsAt - Date.now()).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it("lands on a later Pacific day than the one being burned", () => {
    const resetsAt = new Date(quotaResetsAt());
    expect(pacificDayKey(resetsAt)).not.toBe(pacificDayKey(new Date()));
  });
});
