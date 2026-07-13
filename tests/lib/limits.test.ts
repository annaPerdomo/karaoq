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
      showUpNext: false,
      upNextCount: 16,
      showNowPlaying: false,
      showReactions: false,
      theme: "neon",
      welcomeLine: "x".repeat(MAX_WELCOME_LENGTH),
      attractMode: true,
    };
    expect(isValidDisplayConfig(config)).toBe(true);
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

  it("rejects an upNextCount outside the enum", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, upNextCount: 10 })).toBe(false);
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
