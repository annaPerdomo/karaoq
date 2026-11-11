import { describe, it, expect } from "vitest";
import { autoStartFor, isExternal, youtubeWatchUrl } from "../../lib/externalEntry";

describe("externalEntry", () => {
  it("isExternal is true only for external: true", () => {
    expect(isExternal({ external: true })).toBe(true);
    expect(isExternal({})).toBe(false);
    expect(isExternal(null)).toBe(false);
    expect(isExternal(undefined)).toBe(false);
  });

  it("builds the watch URL", () => {
    expect(youtubeWatchUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("hides an armed stamp from an external entry only", () => {
    expect(autoStartFor({ external: true }, 123)).toBeNull();
    expect(autoStartFor({}, 123)).toBe(123);
    expect(autoStartFor(undefined, 123)).toBe(123);
  });
});

import { autoArmEnabled, mayReportEnded, playerListenerActive, shouldArmAutoStart } from "../../lib/externalEntry";

describe("external guard predicates", () => {
  it("block every in-app automation for an external entry and change nothing for others", () => {
    const ext = { external: true as const };
    expect(shouldArmAutoStart(ext)).toBe(false);
    expect(mayReportEnded(ext)).toBe(false);
    expect(playerListenerActive(true, ext)).toBe(false);
    expect(autoArmEnabled(true, ext)).toBe(false);

    for (const entry of [{}, null, undefined]) {
      expect(shouldArmAutoStart(entry)).toBe(true);
      expect(mayReportEnded(entry)).toBe(true);
      expect(playerListenerActive(true, entry)).toBe(true);
      expect(playerListenerActive(false, entry)).toBe(false);
      expect(autoArmEnabled(true, entry)).toBe(true);
      expect(autoArmEnabled(false, entry)).toBe(false);
    }
  });
});
