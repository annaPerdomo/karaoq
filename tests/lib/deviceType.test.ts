import { describe, it, expect } from "vitest";
import { deviceTypeFromUA, platformFromUA, tvPlatformFromUA } from "../../lib/deviceType";

// Every string here is a real User-Agent taken from analytics_sessions, not a
// synthesised one — the point of the classifier is the shapes TVs actually send.
const REAL_TV_AGENTS: [string, string, string][] = [
  [
    "LG NetCast",
    "Mozilla/5.0 (Linux; NetCast; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.207 Safari/537.36 SmartTV/10.0 Colt/2.0",
    "LG",
  ],
  [
    "Samsung Tizen",
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/108.0.5359.1 TV Safari/537.36",
    "Samsung",
  ],
  [
    "Sony BRAVIA",
    "Mozilla/5.0 (Linux; Andr0id 12; BRAVIA 4K VH22) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.120 Safari/537.36 OMI/4.25.1.92.StableAVB_Sony.1",
    "Sony",
  ],
  [
    "Telefunken on Vestel",
    "Mozilla/5.0 (Linux ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Safari/537.36 OPR/46.0.2207.0 OMI/4.23.2.96.LIMA2.172 Model/Vestel-MB181 VSTVB MB100 FVC/8.0 (TELEFUNKEN; MB181; ) TiVoOS/1.0.0 (Vestel MB181 TELEFUNKEN) SmartTvA/3.0.0",
    "Vestel",
  ],
];

describe("deviceTypeFromUA", () => {
  for (const [name, ua] of REAL_TV_AGENTS) {
    it(`reads a ${name} as a TV`, () => {
      expect(deviceTypeFromUA(ua)).toBe("tv");
    });
  }

  // The regression the TV bucket exists for: this one says "Mobile Safari", so
  // the old mobile-or-desktop test filed a 4K television under phones.
  it("reads an Android TV claiming Mobile Safari as a TV, not a phone", () => {
    expect(
      deviceTypeFromUA(
        "Mozilla/5.0 (Linux; Android 12; SmartTV 4K Build/STT2.230929.001.092) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/143.0.7499.34 Mobile Safari/537.36"
      )
    ).toBe("tv");
  });

  it("still reads phones and tablets as mobile", () => {
    expect(
      deviceTypeFromUA(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1"
      )
    ).toBe("mobile");
    expect(
      deviceTypeFromUA(
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("mobile");
  });

  it("still reads laptops as desktop", () => {
    expect(
      deviceTypeFromUA(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
      )
    ).toBe("desktop");
    expect(
      deviceTypeFromUA(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0"
      )
    ).toBe("desktop");
  });

  it("has no opinion when the session stored no UA", () => {
    expect(deviceTypeFromUA(undefined)).toBeNull();
    expect(deviceTypeFromUA("")).toBeNull();
  });
});

describe("platformFromUA", () => {
  it("names handhelds and desktops", () => {
    const cases: [string, string][] = [
      [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",
        "iPhone",
      ],
      [
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
        "Android",
      ],
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "Mac",
      ],
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "Windows",
      ],
      [
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        "Chromebook",
      ],
    ];
    for (const [ua, want] of cases) expect(platformFromUA(ua)).toBe(want);
  });

  it("suffixes a TV make without stuttering when the name already says TV", () => {
    expect(platformFromUA(REAL_TV_AGENTS[0][1])).toBe("LG TV");
    // Regression: this produced "Android TV TV" in the first cut.
    expect(
      platformFromUA(
        "Mozilla/5.0 (Linux; Android 14; Smart TV Pro Build/UTT2.250416.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/136.0.7103.60 Mobile Safari/537.36"
      )
    ).toBe("Android TV");
    expect(platformFromUA("Mozilla/5.0 (PlayStation 5/2.26) AppleWebKit/605.1.15")).toBe("Console");
  });

  it("classifies a TV by its make, never as the Android phone it claims to be", () => {
    for (const [, ua] of REAL_TV_AGENTS) {
      expect(platformFromUA(ua)).not.toBe("Android");
    }
  });
});

describe("tvPlatformFromUA", () => {
  for (const [name, ua, platform] of REAL_TV_AGENTS) {
    it(`names a ${name} as ${platform}`, () => {
      expect(tvPlatformFromUA(ua)).toBe(platform);
    });
  }

  // Unbranded Android panels are the second-biggest group in the data, and
  // their only tell is the "Smart TV" device model.
  it("names an unbranded Android panel as Android TV", () => {
    expect(
      tvPlatformFromUA(
        "Mozilla/5.0 (Linux; Android 14; Smart TV Pro Build/UTT2.250416.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/136.0.7103.60 Mobile Safari/537.36"
      )
    ).toBe("Android TV");
  });

  it("still names an LG as LG, whose UA also says SmartTV", () => {
    expect(tvPlatformFromUA(REAL_TV_AGENTS[0][1])).toBe("LG");
  });

  it("falls back to Other TV for a set we haven't named", () => {
    expect(tvPlatformFromUA("Mozilla/5.0 (HbbTV/1.5.1) SomeUnknownPanel/2.0")).toBe("Other TV");
  });

  it("returns null for anything that isn't a TV, so callers can branch on one value", () => {
    expect(
      tvPlatformFromUA(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1"
      )
    ).toBeNull();
  });
});
