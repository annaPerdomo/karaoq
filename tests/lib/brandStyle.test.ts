import { describe, it, expect } from "vitest";
import { brandStyle } from "../../lib/brandStyle";

describe("brandStyle", () => {
  it("sets nothing without a brand or accents", () => {
    expect(brandStyle(undefined)).toEqual({});
    expect(brandStyle({})).toEqual({});
    expect(brandStyle({ logo: "0123456789abcdef" })).toEqual({});
  });

  it("sets only the accents the brand carries", () => {
    expect(brandStyle({ accentA: "#ff0080" })).toEqual({ "--acc-a": "#ff0080" });
  });

  it("derives a matching --acc-b-rgb from accentB", () => {
    expect(brandStyle({ accentA: "#000000", accentB: "#1E90fF" })).toEqual({
      "--acc-a": "#000000",
      "--acc-b": "#1E90fF",
      "--acc-b-rgb": "30, 144, 255",
    });
  });
});
