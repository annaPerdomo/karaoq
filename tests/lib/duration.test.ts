import { describe, it, expect } from "vitest";
import { parseIso8601Duration, formatDuration, formatCountdown } from "../../lib/duration";

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

describe("formatCountdown", () => {
  const t = (key: string, vars?: Record<string, string | number>) =>
    key === "time.hoursMinutes"
      ? `${vars!.hours} hr ${vars!.minutes} min`
      : key === "time.hours"
      ? `${vars!.count} hr`
      : `${vars!.count} min`;

  it("shows hours and minutes together", () => {
    expect(formatCountdown(2 * 3600 + 15 * 60, t)).toBe("2 hr 15 min");
  });

  it("omits minutes on an exact hour", () => {
    expect(formatCountdown(3 * 3600, t)).toBe("3 hr");
  });

  it("shows minutes only under an hour", () => {
    expect(formatCountdown(45 * 60, t)).toBe("45 min");
  });

  it("rounds up to the next minute rather than underestimating", () => {
    expect(formatCountdown(90, t)).toBe("2 min");
  });

  it("never reports zero, even for a reset that's already due", () => {
    expect(formatCountdown(0, t)).toBe("1 min");
    expect(formatCountdown(-10, t)).toBe("1 min");
  });
});
