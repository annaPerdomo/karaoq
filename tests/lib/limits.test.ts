import { describe, it, expect } from "vitest";
import { isValidDisplayConfig, MAX_WELCOME_LENGTH } from "../../lib/limits";
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig } from "../../pages/api/types";

describe("isValidDisplayConfig", () => {
  it("accepts the default config", () => {
    expect(isValidDisplayConfig(DEFAULT_DISPLAY_CONFIG)).toBe(true);
  });

  it("accepts a fully populated valid config", () => {
    const config: DisplayConfig = {
      qrSize: "hidden",
      qrPx: 140,
      showUpNext: false,
      upNextCount: 16,
      showNowPlaying: false,
      showReactions: false,
      theme: "neon",
      sidebarPosition: "left",
      sidebarWidth: 460,
      sidebarOrder: ["welcome", "upNext", "qr"],
      welcomeLine: "x".repeat(MAX_WELCOME_LENGTH),
      attractMode: true,
    };
    expect(isValidDisplayConfig(config)).toBe(true);
  });

  it("accepts a config without the drag-era fields (older clients)", () => {
    const {
      qrPx: _q,
      sidebarPosition: _p,
      sidebarWidth: _w,
      sidebarOrder: _o,
      ...legacy
    } = DEFAULT_DISPLAY_CONFIG;
    expect(isValidDisplayConfig(legacy)).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidDisplayConfig(null)).toBe(false);
    expect(isValidDisplayConfig(undefined)).toBe(false);
    expect(isValidDisplayConfig("x")).toBe(false);
    expect(isValidDisplayConfig(42)).toBe(false);
  });

  it("rejects an invalid qrSize", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, qrSize: "huge" })).toBe(false);
  });

  it("rejects a non-boolean showUpNext", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, showUpNext: "yes" })).toBe(false);
  });

  it("accepts any whole upNextCount within range", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, upNextCount: 10 })).toBe(true);
  });

  it("rejects an upNextCount outside 1-20 or fractional", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, upNextCount: 0 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, upNextCount: 21 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, upNextCount: 7.5 })).toBe(false);
  });

  it("rejects out-of-range drag dimensions", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, qrPx: 47 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, qrPx: 141 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarWidth: 219 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarWidth: 461 })).toBe(false);
  });

  it("rejects a sidebarOrder that is not a permutation of all sections", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarOrder: ["qr"] })).toBe(false);
    expect(
      isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarOrder: ["qr", "qr", "welcome"] })
    ).toBe(false);
  });

  it("rejects a non-boolean showNowPlaying", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, showNowPlaying: 1 })).toBe(false);
  });

  it("rejects a non-boolean showReactions", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, showReactions: 1 })).toBe(false);
  });

  it("rejects an invalid theme", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, theme: "disco" })).toBe(false);
  });

  it("rejects a non-string welcomeLine", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, welcomeLine: 5 })).toBe(false);
  });

  it("rejects a welcomeLine over the max length", () => {
    expect(
      isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, welcomeLine: "x".repeat(MAX_WELCOME_LENGTH + 1) })
    ).toBe(false);
  });

  it("rejects a non-boolean attractMode", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, attractMode: 1 })).toBe(false);
  });

  it("rejects unknown extra keys", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, extra: true })).toBe(false);
  });
});
