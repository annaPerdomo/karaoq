import { describe, it, expect } from "vitest";
import {
  DEFAULT_HOST_CONFIG,
  hostConfigChangedFields,
  normalizeHostConfig,
} from "../../pages/api/types";

describe("hostConfigChangedFields", () => {
  it("reports nothing for the untouched defaults", () => {
    expect(hostConfigChangedFields({ ...DEFAULT_HOST_CONFIG })).toEqual([]);
  });

  it("reports scalar fields that differ from the defaults", () => {
    const changed = hostConfigChangedFields({
      ...DEFAULT_HOST_CONFIG,
      theme: "neon",
      sidebarPosition: "left",
    });
    expect(changed.sort()).toEqual(["sidebarPosition", "theme"]);
  });

  it("treats a reordered sidebar as changed", () => {
    expect(
      hostConfigChangedFields({
        ...DEFAULT_HOST_CONFIG,
        sectionOrder: ["qr", "boards", "queue"],
      })
    ).toEqual(["sectionOrder"]);
  });

  it("treats the default order (fresh array) as unchanged", () => {
    expect(
      hostConfigChangedFields({
        ...DEFAULT_HOST_CONFIG,
        sectionOrder: [...DEFAULT_HOST_CONFIG.sectionOrder],
      })
    ).toEqual([]);
  });
});

describe("normalizeHostConfig", () => {
  it("fills every field for an undefined config", () => {
    expect(normalizeHostConfig(undefined)).toEqual(DEFAULT_HOST_CONFIG);
  });

  it("backfills sections added after a config was saved, in default order", () => {
    const stored = { ...DEFAULT_HOST_CONFIG, sectionOrder: ["qr"] as never };
    expect(normalizeHostConfig(stored).sectionOrder).toEqual([
      "qr",
      "queue",
      "banner",
      "boards",
    ]);
  });

  it("leaves a complete config untouched", () => {
    const stored = {
      ...DEFAULT_HOST_CONFIG,
      showQr: false,
      sectionOrder: ["qr", "boards", "queue", "banner"] as const,
    };
    expect(normalizeHostConfig(stored)).toEqual(stored);
  });

  // A section that was renamed or removed must not survive in a stored order,
  // or the next save would fail the endpoint's exactly-once check.
  it("drops retired sections from a stored order", () => {
    const stored = {
      ...DEFAULT_HOST_CONFIG,
      sectionOrder: ["celebration", "qr", "boards", "queue", "banner"] as never,
    };
    expect(normalizeHostConfig(stored).sectionOrder).toEqual([
      "qr",
      "boards",
      "queue",
      "banner",
    ]);
  });

  // Retired fields must not survive a round-trip, or the next save would fail
  // the endpoint's unknown-key check.
  it("drops fields that no longer exist on the config", () => {
    const stored = { ...DEFAULT_HOST_CONFIG, showTransport: true, showHistory: false } as never;
    const config = normalizeHostConfig(stored);
    expect(config).not.toHaveProperty("showTransport");
    expect(config).not.toHaveProperty("showHistory");
  });
});
