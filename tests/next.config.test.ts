import { describe, it, expect } from "vitest";
import nextConfig from "../next.config.js";

describe("next.config.js", () => {
  it("builds with output: standalone and the i18n config untouched", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.i18n.locales).toContain("en");
    expect(nextConfig.i18n.defaultLocale).toBe("en");
    expect(nextConfig.i18n.localeDetection).toBe(false);
  });
});
