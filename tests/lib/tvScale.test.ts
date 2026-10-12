import { describe, it, expect } from "vitest";
import { tvScale } from "../../lib/tvScale";

describe("tvScale", () => {
  it("is 1 at the design resolution", () => {
    expect(tvScale(1600, 900)).toBe(1);
  });

  it("scales up to 1080p", () => {
    expect(tvScale(1920, 1080)).toBe(1.2);
  });

  it("scales up to 4K", () => {
    expect(tvScale(3840, 2160)).toBe(2.4);
  });

  it("fits a small reported viewport exactly at the floor", () => {
    expect(tvScale(960, 540)).toBe(0.6);
  });

  it("rounds to 3 decimals for an odd aspect ratio", () => {
    expect(tvScale(1366, 768)).toBe(0.853);
  });

  it("uses the narrower axis on an ultrawide", () => {
    expect(tvScale(2560, 1080)).toBe(1.2);
  });

  it("clamps a tiny viewport to the floor", () => {
    expect(tvScale(640, 360)).toBe(0.6);
  });

  it("scales a 720p set down", () => {
    expect(tvScale(1280, 720)).toBe(0.8);
  });

  it("caps an 8K viewport at the ceiling", () => {
    expect(tvScale(7680, 4320)).toBe(3);
  });

  it("falls back to 1 for a zero width", () => {
    expect(tvScale(0, 720)).toBe(1);
  });

  it("falls back to 1 for NaN", () => {
    expect(tvScale(NaN, 720)).toBe(1);
  });
});
