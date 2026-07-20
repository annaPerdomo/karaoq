import { describe, it, expect } from "vitest";
import {
  DEFAULT_DISPLAY_CONFIG,
  displayConfigChangedFields,
  normalizeDisplayConfig,
} from "../../pages/api/types";

describe("displayConfigChangedFields", () => {
  it("reports nothing for the untouched defaults", () => {
    expect(displayConfigChangedFields({ ...DEFAULT_DISPLAY_CONFIG })).toEqual([]);
  });

  it("reports scalar fields that differ from the defaults", () => {
    const changed = displayConfigChangedFields({
      ...DEFAULT_DISPLAY_CONFIG,
      theme: "neon",
      showNowPlaying: false,
      welcomeLine: "Karaoke Tuesdays",
    });
    expect(changed.sort()).toEqual(["showNowPlaying", "theme", "welcomeLine"]);
  });

  it("treats a reordered sidebar as changed", () => {
    expect(
      displayConfigChangedFields({
        ...DEFAULT_DISPLAY_CONFIG,
        sidebarOrder: ["upNext", "qr", "welcome"],
      })
    ).toEqual(["sidebarOrder"]);
  });

  it("treats the default order (fresh array) as unchanged", () => {
    expect(
      displayConfigChangedFields({
        ...DEFAULT_DISPLAY_CONFIG,
        sidebarOrder: [...DEFAULT_DISPLAY_CONFIG.sidebarOrder],
      })
    ).toEqual([]);
  });

  it("reports both QR fields when the QR is resized", () => {
    expect(
      displayConfigChangedFields({
        ...DEFAULT_DISPLAY_CONFIG,
        qrSize: "large",
        qrPx: 120,
      }).sort()
    ).toEqual(["qrPx", "qrSize"]);
  });
});

describe("normalizeDisplayConfig theme handling", () => {
  it.each(["sunset", "ocean", "gold", "forest", "pastel", "party"])(
    "falls back to classic for the retired %s theme",
    (theme) => {
      const stored = { ...DEFAULT_DISPLAY_CONFIG, theme: theme as never };
      expect(normalizeDisplayConfig(stored).theme).toBe("classic");
    }
  );

  it.each(["classic", "minimal", "neon"] as const)("keeps the %s theme", (theme) => {
    const stored = { ...DEFAULT_DISPLAY_CONFIG, theme };
    expect(normalizeDisplayConfig(stored).theme).toBe(theme);
  });

  // The cheer overlay moved to the room's reactions setting. A config still
  // carrying it must not round-trip it back, or the next save would 400 on the
  // endpoint's unknown-key check.
  it("drops the retired showReactions field", () => {
    const stored = { ...DEFAULT_DISPLAY_CONFIG, showReactions: false } as never;
    expect(normalizeDisplayConfig(stored)).not.toHaveProperty("showReactions");
  });
});
