import { describe, it, expect } from "vitest";
import { roundDownNice, shapeStats, STAT_FLOORS } from "../../lib/publicStats";

describe("roundDownNice", () => {
  it("returns small numbers untouched", () => {
    expect(roundDownNice(0)).toBe(0);
    expect(roundDownNice(47)).toBe(47);
    expect(roundDownNice(99)).toBe(99);
  });

  it("rounds down to two significant digits", () => {
    expect(roundDownNice(100)).toBe(100);
    expect(roundDownNice(347)).toBe(340);
    expect(roundDownNice(1384)).toBe(1300);
    expect(roundDownNice(9999)).toBe(9900);
    expect(roundDownNice(12345)).toBe(12000);
  });

  it("never rounds up", () => {
    for (const n of [101, 555, 1049, 1051, 88888]) {
      expect(roundDownNice(n)).toBeLessThanOrEqual(n);
    }
  });
});

describe("shapeStats", () => {
  const codes = ["US", "DE", "MT", "PH", "CZ", "ES", "ID"];

  it("rounds counts and passes the country count through exactly", () => {
    const stats = shapeStats({ songs: 1384, cheers: 1235, countryCodes: codes });
    expect(stats).toEqual({
      songs: 1300,
      cheers: 1200,
      countries: 7,
      countryCodes: codes,
    });
  });

  it("keeps every country code, most active first, for the map", () => {
    const stats = shapeStats({ songs: 500, cheers: 500, countryCodes: codes });
    expect(stats.countryCodes).toEqual(codes);
  });

  it("nulls figures below their floors instead of underselling", () => {
    const stats = shapeStats({
      songs: STAT_FLOORS.songs - 1,
      cheers: STAT_FLOORS.cheers - 1,
      countryCodes: ["US", "DE"],
    });
    expect(stats).toEqual({
      songs: null,
      cheers: null,
      countries: null,
      countryCodes: [],
    });
  });

  it("keeps figures independent — one strong stat still shows", () => {
    const stats = shapeStats({ songs: 2000, cheers: 3, countryCodes: ["US"] });
    expect(stats.songs).toBe(2000);
    expect(stats.cheers).toBeNull();
    expect(stats.countries).toBeNull();
  });
});
