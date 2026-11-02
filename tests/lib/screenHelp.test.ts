import { describe, it, expect } from "vitest";
import { screenHelpPlan, SCREEN_HELP_OPTIONS } from "../../lib/screenHelp";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SAMSUNG_TV_UA =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/108.0.5359.1 TV Safari/537.36";

describe("screenHelpPlan", () => {
  it("reads an iPhone as mobile with AirPlay and the pair-first order", () => {
    expect(screenHelpPlan(IPHONE_UA)).toEqual({
      device: "mobile",
      mirror: "airplay",
      options: ["pair", "mirror", "laptop"],
    });
  });

  it("reads an Android phone as mobile with Cast", () => {
    expect(screenHelpPlan(ANDROID_PHONE_UA)).toEqual({
      device: "mobile",
      mirror: "cast",
      options: ["pair", "mirror", "laptop"],
    });
  });

  it("reads a Mac as desktop with AirPlay and the popout-first order", () => {
    expect(screenHelpPlan(MAC_UA)).toEqual({
      device: "desktop",
      mirror: "airplay",
      options: ["popout", "pair", "mirror"],
    });
  });

  it("reads Windows as desktop with Cast", () => {
    expect(screenHelpPlan(WINDOWS_UA)).toEqual({
      device: "desktop",
      mirror: "cast",
      options: ["popout", "pair", "mirror"],
    });
  });

  it("reads a Samsung Tizen TV as tv with only the onTv option", () => {
    expect(screenHelpPlan(SAMSUNG_TV_UA)).toEqual({
      device: "tv",
      mirror: "cast",
      options: ["onTv"],
    });
  });

  it("falls back to desktop for a null UA", () => {
    expect(screenHelpPlan(null).device).toBe("desktop");
  });

  const uas = [IPHONE_UA, ANDROID_PHONE_UA, MAC_UA, WINDOWS_UA, SAMSUNG_TV_UA, null];
  it.each(uas)("has no duplicate options and every entry is a known option (%s)", (ua) => {
    const { options } = screenHelpPlan(ua);
    expect(new Set(options).size).toBe(options.length);
    for (const option of options) {
      expect(SCREEN_HELP_OPTIONS).toContain(option);
    }
  });
});
