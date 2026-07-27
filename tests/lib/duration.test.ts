import { describe, it, expect } from "vitest";
import { parseIso8601Duration, formatDuration } from "../../lib/duration";

describe("parseIso8601Duration", () => {
  it("parses minutes and seconds", () => {
    expect(parseIso8601Duration("PT3M45S")).toBe(225);
  });

  it("parses hours, minutes and seconds", () => {
    expect(parseIso8601Duration("PT1H2M3S")).toBe(3723);
  });

  it("parses seconds only", () => {
    expect(parseIso8601Duration("PT58S")).toBe(58);
  });

  it("parses minutes only", () => {
    expect(parseIso8601Duration("PT4M")).toBe(240);
  });

  it("parses days (live-stream archives)", () => {
    expect(parseIso8601Duration("P1DT2H")).toBe(93600);
  });

  it("rejects garbage and empty strings", () => {
    expect(parseIso8601Duration("")).toBeUndefined();
    expect(parseIso8601Duration("nonsense")).toBeUndefined();
    expect(parseIso8601Duration("P")).toBeUndefined();
    expect(parseIso8601Duration("PT")).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(225)).toBe("3:45");
    expect(formatDuration(58)).toBe("0:58");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  it("clamps negatives to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});
