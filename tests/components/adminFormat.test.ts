import { describe, it, expect } from "vitest";
import {
  ADMIN_LIVE_WINDOW_MS,
  isLive,
  lookupOutcomeParts,
} from "../../components/admin/format";

describe("lookupOutcomeParts", () => {
  it("orders outcomes the same way regardless of aggregation order", () => {
    expect(
      lookupOutcomeParts([
        { _id: "not_embeddable", count: 1 },
        { _id: "hit", count: 38 },
        { _id: "not_found", count: 3 },
      ])
    ).toEqual(["38 found", "3 bad link", "1 blocked"]);
  });

  it("drops outcomes nobody hit", () => {
    expect(lookupOutcomeParts([{ _id: "hit", count: 5 }])).toEqual(["5 found"]);
    expect(lookupOutcomeParts([])).toEqual([]);
  });

  it("shows an unrecognised outcome rather than swallowing it", () => {
    expect(
      lookupOutcomeParts([
        { _id: "hit", count: 2 },
        { _id: "something_new", count: 1 },
      ])
    ).toEqual(["2 found", "1 something_new"]);
  });
});

describe("isLive", () => {
  const agoISO = (ms: number) => new Date(Date.now() - ms).toISOString();

  it("counts a room whose last action is inside the window", () => {
    expect(isLive(agoISO(0))).toBe(true);
    expect(isLive(agoISO(ADMIN_LIVE_WINDOW_MS - 60_000))).toBe(true);
  });

  it("drops a room that has gone quiet, however recently a page pinged", () => {
    expect(isLive(agoISO(ADMIN_LIVE_WINDOW_MS + 60_000))).toBe(false);
    // The forgotten-tab case: beating every 60s, untouched for nine hours.
    expect(isLive(agoISO(9 * 60 * 60_000))).toBe(false);
  });

  it("treats a missing or unparseable stamp as not live", () => {
    expect(isLive(null)).toBe(false);
    expect(isLive(undefined)).toBe(false);
    expect(isLive("")).toBe(false);
    expect(isLive("not a date")).toBe(false);
  });
});
