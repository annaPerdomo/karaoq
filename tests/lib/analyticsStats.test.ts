import { describe, it, expect } from "vitest";
import {
  buildSongsHistogram,
  median,
  percentile,
  resolveTimezone,
  summarizeFunnel,
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
