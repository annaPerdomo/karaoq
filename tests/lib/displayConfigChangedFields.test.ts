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
      bannerLine: "Karaoke Tuesdays",
    });
    expect(changed.sort()).toEqual(["bannerLine", "showNowPlaying", "theme"]);
  });

  it("treats a reordered sidebar as changed", () => {
    expect(
      displayConfigChangedFields({
        ...DEFAULT_DISPLAY_CONFIG,
        sidebarOrder: ["upNext", "qr", "banner"],
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

// The welcome line folded into the announcement banner; stored configs from
// before still carry it (and may list it in sidebarOrder).
describe("normalizeDisplayConfig welcome-line migration", () => {
  it("migrates a stored welcomeLine into an empty banner", () => {
    const stored = { ...DEFAULT_DISPLAY_CONFIG, welcomeLine: "Karaoke Tuesdays" } as never;
    const config = normalizeDisplayConfig(stored);
    expect(config.bannerLine).toBe("Karaoke Tuesdays");
    expect(config).not.toHaveProperty("welcomeLine");
  });

  it("keeps an existing banner over a stored welcomeLine", () => {
    const stored = {
      ...DEFAULT_DISPLAY_CONFIG,
      welcomeLine: "Karaoke Tuesdays",
      bannerLine: "Happy 30th, Sam!",
    } as never;
    expect(normalizeDisplayConfig(stored).bannerLine).toBe("Happy 30th, Sam!");
  });

  it("drops the retired welcome section from a stored sidebarOrder", () => {
    const stored = {
      ...DEFAULT_DISPLAY_CONFIG,
      sidebarOrder: ["qr", "welcome", "banner", "upNext", "boards"],
      attractMode: true,
    } as never;
    const config = normalizeDisplayConfig(stored);
    expect(config.sidebarOrder).toEqual(["qr", "banner", "upNext", "boards"]);
    expect(config).not.toHaveProperty("attractMode");
  });
});
