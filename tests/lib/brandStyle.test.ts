import { describe, it, expect } from "vitest";
import { brandsEqual, brandStyle, roundLogoScale } from "../../lib/brandStyle";

describe("brandStyle", () => {
  it("sets nothing without a brand or accents", () => {
    expect(brandStyle(undefined)).toEqual({});
    expect(brandStyle({})).toEqual({});
    expect(brandStyle({ logo: "0123456789abcdef" })).toEqual({});
  });

  it("sets --logo-scale only when the brand carries one", () => {
    expect(brandStyle({ logoScale: 1.5 })).toEqual({ "--logo-scale": "1.5" });
    expect(brandStyle({})["--logo-scale"]).toBeUndefined();
  });

  it("sets only the accents the brand carries", () => {
    expect(brandStyle({ accentA: "#ff0080" })).toEqual({
      "--acc-a": "#ff0080",
      "--acc-a-rgb": "255, 0, 128",
    });
  });

  it("derives matching rgb vars from accentA and accentB, and mirrors accentB onto --acc-warm", () => {
    expect(brandStyle({ accentA: "#000000", accentB: "#1E90fF" })).toEqual({
      "--acc-a": "#000000",
      "--acc-a-rgb": "0, 0, 0",
      "--acc-b": "#1E90fF",
      "--acc-b-rgb": "30, 144, 255",
      "--acc-warm": "#1E90fF",
      "--acc-warm-rgb": "30, 144, 255",
      "--acc-c": "#1E90fF",
      "--acc-c-rgb": "30, 144, 255",
    });
  });
});

describe("brandsEqual", () => {
  it("compares logoScale alongside the other fields", () => {
    expect(brandsEqual({ logoScale: 1.2 }, { logoScale: 1.2 })).toBe(true);
    expect(brandsEqual({ logoScale: 1.2 }, { logoScale: 1.3 })).toBe(false);
    expect(brandsEqual({}, { logoScale: 1 })).toBe(false);
  });
});

describe("roundLogoScale", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundLogoScale(1.2345)).toBe(1.23);
    expect(roundLogoScale(0.5)).toBe(0.5);
    expect(roundLogoScale(1.236)).toBe(1.24);
  });
});
