import { describe, it, expect } from "vitest";
import { BURST_SECONDS } from "../../lib/confetti";
import { CHEER_HOLD_SECONDS, cheerRevealSeconds } from "../../components/host/stageTiming";

describe("cheerRevealSeconds", () => {
  it("holds the cheer for the full beat when nothing is counting down", () => {
    expect(cheerRevealSeconds(5, false)).toBe(CHEER_HOLD_SECONDS);
    expect(cheerRevealSeconds(60, false)).toBe(CHEER_HOLD_SECONDS);
  });

  it("hands over partway through a counting gap, capped at the full hold", () => {
    expect(cheerRevealSeconds(10, true)).toBe(6);
    expect(cheerRevealSeconds(30, true)).toBe(CHEER_HOLD_SECONDS);
  });

  it("never hands over before the paper has settled", () => {
    expect(cheerRevealSeconds(3, true)).toBeGreaterThan(BURST_SECONDS);
    expect(cheerRevealSeconds(5, true)).toBeGreaterThan(BURST_SECONDS);
  });
});
