import { describe, it, expect } from "vitest";
import { tvScale } from "../../lib/tvScale";

describe("tvScale", () => {
  it("is 1 at the design resolution", () => {
    expect(tvScale(1280, 720)).toBe(1);
  });

  it("scales up to 1080p", () => {
    expect(tvScale(1920, 1080)).toBe(1.5);
  });

  it("scales up to 4K", () => {
    expect(tvScale(3840, 2160)).toBe(3);
  });

  it("clamps at the floor for a small reported viewport", () => {
    expect(tvScale(960, 540)).toBe(0.75);
  });

  it("rounds to 3 decimals for an odd aspect ratio", () => {
    expect(tvScale(1366, 768)).toBe(1.067);
  });

  it("uses the narrower axis on an ultrawide", () => {
    expect(tvScale(2560, 1080)).toBe(1.5);
  });

  it("clamps a tiny viewport to the floor", () => {
    expect(tvScale(640, 360)).toBe(0.75);
  });

  it("falls back to 1 for a zero width", () => {
    expect(tvScale(0, 720)).toBe(1);
  });

  it("falls back to 1 for NaN", () => {
    expect(tvScale(NaN, 720)).toBe(1);
  });
});
