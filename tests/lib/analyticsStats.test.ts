import { describe, it, expect } from "vitest";
import {
  buildSongsHistogram,
  median,
  percentile,
  resolveTimezone,
  summarizeCorpusPicks,
  summarizeFunnel,
  summarizeLinkLookups,
  type CorpusPickRow,
} from "../../lib/analyticsStats";

describe("resolveTimezone", () => {
  it("accepts a valid IANA timezone", () => {
    expect(resolveTimezone("America/New_York")).toBe("America/New_York");
  });

  it("falls back to UTC for invalid names", () => {
    expect(resolveTimezone("Not/AZone")).toBe("UTC");
  });

  it("falls back to UTC for non-strings", () => {
    expect(resolveTimezone(undefined)).toBe("UTC");
    expect(resolveTimezone(["America/New_York"])).toBe("UTC");
    expect(resolveTimezone("")).toBe("UTC");
  });
});

describe("median / percentile", () => {
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
    expect(percentile([], 0.9)).toBeNull();
  });

  it("computes the median of odd-length input", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("interpolates the median of even-length input", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("computes p90 with interpolation", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9.1);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("buildSongsHistogram", () => {
  it("infers zero-song rooms from the total", () => {
    const buckets = buildSongsHistogram([1, 2, 4, 12], 10);
    expect(buckets).toEqual([
      { label: "0 songs", count: 6 },
      { label: "1–2", count: 2 },
      { label: "3–5", count: 1 },
      { label: "6–10", count: 0 },
      { label: "11+", count: 1 },
    ]);
  });

  it("never reports negative zero-song rooms", () => {
    // Merged rooms can leave more song-adding rooms than room_created events.
    const buckets = buildSongsHistogram([1, 1], 1);
    expect(buckets[0]).toEqual({ label: "0 songs", count: 0 });
  });
});

describe("summarizeFunnel", () => {
  it("summarizes empty input", () => {
    expect(summarizeFunnel([])).toEqual({
      roomsCreated: 0,
      roomsSearched: 0,
      roomsWithSong: 0,
      roomsEngaged: 0,
      medianMinutesToFirstSong: null,
      p90MinutesToFirstSong: null,
    });
  });

  it("counts each funnel stage", () => {
    const summary = summarizeFunnel([
      { searches: 0, songs: 0, minutesToFirstSong: null },
      { searches: 2, songs: 0, minutesToFirstSong: null },
      { searches: 1, songs: 1, minutesToFirstSong: 4 },
      { searches: 3, songs: 5, minutesToFirstSong: 2 },
    ]);
    expect(summary.roomsCreated).toBe(4);
    expect(summary.roomsSearched).toBe(3);
    expect(summary.roomsWithSong).toBe(2);
    expect(summary.roomsEngaged).toBe(1);
    expect(summary.medianMinutesToFirstSong).toBe(3);
  });

  it("treats rooms with songs but no search event as having searched", () => {
    // Rooms created before search_performed existed have songs but no
    // search events; the funnel step must not dip below the song step.
    const summary = summarizeFunnel([
      { searches: 0, songs: 2, minutesToFirstSong: 1 },
      { searches: 0, songs: 0, minutesToFirstSong: null },
    ]);
    expect(summary.roomsSearched).toBe(1);
    expect(summary.roomsWithSong).toBe(1);
  });

  it("ignores negative first-song timings", () => {
    const summary = summarizeFunnel([
      { searches: 1, songs: 1, minutesToFirstSong: -5 },
      { searches: 1, songs: 1, minutesToFirstSong: 6 },
    ]);
    expect(summary.medianMinutesToFirstSong).toBe(6);
  });
});

describe("summarizeLinkLookups", () => {
  const rows = [
    { _id: { src: "paste", lookupOutcome: "hit" }, count: 30 },
    { _id: { src: "trending", lookupOutcome: "hit" }, count: 8 },
    { _id: { src: "paste", lookupOutcome: "not_found" }, count: 3 },
    { _id: { src: "paste", lookupOutcome: "not_embeddable" }, count: 1 },
  ];

  it("folds one grouped scan into a total and both breakdowns", () => {
    const summary = summarizeLinkLookups(rows);

    expect(summary.total).toBe(42);
    expect(summary.bySrc).toEqual([
      { _id: "paste", count: 34 },
      { _id: "trending", count: 8 },
    ]);
    expect(summary.byOutcome).toEqual([
      { _id: "hit", count: 38 },
      { _id: "not_found", count: 3 },
      { _id: "not_embeddable", count: 1 },
    ]);
  });

  it("keeps each breakdown summing to the total", () => {
    const summary = summarizeLinkLookups(rows);
    const sum = (rs: { count: number }[]) => rs.reduce((n, r) => n + r.count, 0);

    expect(sum(summary.bySrc)).toBe(summary.total);
    expect(sum(summary.byOutcome)).toBe(summary.total);
  });

  it("groups rows missing a field under 'unknown' rather than dropping them", () => {
    const summary = summarizeLinkLookups([
      { _id: {}, count: 2 },
      { _id: { src: null, lookupOutcome: "hit" }, count: 1 },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.bySrc).toEqual([{ _id: "unknown", count: 3 }]);
    expect(summary.byOutcome).toEqual([
      { _id: "unknown", count: 2 },
      { _id: "hit", count: 1 },
    ]);
  });

  it("reports an explicit zero when nobody pasted a link", () => {
    expect(summarizeLinkLookups([])).toEqual({
      total: 0,
      bySrc: [],
      byOutcome: [],
    });
  });
});

describe("summarizeCorpusPicks", () => {
  const rows: CorpusPickRow[] = [
    { _id: { day: "2026-08-24", country: "PH", fromCorpus: true }, count: 3 },
    { _id: { day: "2026-08-24", country: "FR", fromCorpus: false }, count: 1 },
    { _id: { day: "2026-08-23", country: "PH", fromCorpus: true }, count: 2 },
    { _id: { day: "2026-08-23", country: "PH", fromCorpus: null }, count: 4 },
  ];

  it("splits picks by whether our own store answered the tap", () => {
    const summary = summarizeCorpusPicks(rows);

    expect(summary.total).toBe(10);
    expect(summary.corpusServed).toBe(5);
    expect(summary.searchFallback).toBe(1);
    expect(summary.unattributed).toBe(4);
  });

  it("keeps each breakdown summing to the total", () => {
    const summary = summarizeCorpusPicks(rows);
    const sum = (rs: { count: number }[]) => rs.reduce((n, r) => n + r.count, 0);

    expect(sum(summary.byDay)).toBe(summary.total);
    expect(sum(summary.byCountry)).toBe(summary.total);
    expect(summary.corpusServed + summary.searchFallback + summary.unattributed).toBe(
      summary.total
    );
  });

  it("orders days oldest-first and countries by size", () => {
    const summary = summarizeCorpusPicks(rows);

    expect(summary.byDay).toEqual([
      { _id: "2026-08-23", count: 6 },
      { _id: "2026-08-24", count: 4 },
    ]);
    expect(summary.byCountry).toEqual([
      { _id: "PH", count: 9 },
      { _id: "FR", count: 1 },
    ]);
  });

  it("keeps a pick with no geo instead of dropping it from the country list", () => {
    const summary = summarizeCorpusPicks([
      { _id: { day: "2026-08-24", country: null, fromCorpus: true }, count: 2 },
    ]);

    expect(summary.byCountry).toEqual([{ _id: "Unknown", count: 2 }]);
  });

  it("trims the series to what the panel draws without touching the totals", () => {
    const many: CorpusPickRow[] = [
      { _id: { day: "2026-08-22", country: "PH", fromCorpus: true }, count: 5 },
      { _id: { day: "2026-08-23", country: "FR", fromCorpus: true }, count: 3 },
      { _id: { day: "2026-08-24", country: "DE", fromCorpus: false }, count: 1 },
    ];

    const summary = summarizeCorpusPicks(many, { days: 2, countries: 2 });

    expect(summary.byDay.map((d) => d._id)).toEqual(["2026-08-23", "2026-08-24"]);
    expect(summary.byCountry.map((c) => c._id)).toEqual(["PH", "FR"]);
    expect(summary.total).toBe(9);
    expect(summary.corpusServed).toBe(8);
  });

  it("reports an explicit zero before anyone picks off a shelf", () => {
    expect(summarizeCorpusPicks([])).toEqual({
      total: 0,
      corpusServed: 0,
      searchFallback: 0,
      unattributed: 0,
      byDay: [],
      byCountry: [],
    });
  });
});
