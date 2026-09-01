import { describe, it, expect, afterEach, vi } from "vitest";
import {
  alphaSource,
  decodedWithAlpha,
  forcedSource,
  prefersReducedData,
  HEVC,
  WEBM,
} from "../../components/home/heroFilm";

/** jsdom reports Apple's vendor and an empty platform; both need overriding. */
function asBrowser(vendor: string, platform: string, hevc: boolean) {
  vi.spyOn(navigator, "vendor", "get").mockReturnValue(vendor);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue(
    hevc ? "probably" : "",
  );
}

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

afterEach(() => {
  vi.restoreAllMocks();
  setSearch("");
});

describe("alphaSource", () => {
  it("gives HEVC to Safari on Apple hardware", () => {
    asBrowser("Apple Computer, Inc.", "MacIntel", true);
    expect(alphaSource()).toBe(HEVC);
    asBrowser("Apple Computer, Inc.", "iPhone", true);
    expect(alphaSource()).toBe(HEVC);
  });

  // The regression that put a black slab on a TV — see `alphaSource`.
  it("keeps non-Apple WebKit ports on WebM even when they claim hvc1", () => {
    asBrowser("Apple Computer, Inc.", "Linux armv7l", true);
    expect(alphaSource()).toBe(WEBM);
  });

  it("keeps Chromium and Gecko on WebM", () => {
    asBrowser("Google Inc.", "Linux x86_64", true);
    expect(alphaSource()).toBe(WEBM);
    asBrowser("", "MacIntel", false);
    expect(alphaSource()).toBe(WEBM);
  });

  it("falls back to WebM when Apple hardware can't play hvc1", () => {
    asBrowser("Apple Computer, Inc.", "MacIntel", false);
    expect(alphaSource()).toBe(WEBM);
  });
});

describe("forcedSource", () => {
  it("distinguishes no override from a forced poster", () => {
    setSearch("");
    expect(forcedSource()).toBeUndefined();
    setSearch("?film=poster");
    expect(forcedSource()).toBeNull();
  });

  it("pins an encode", () => {
    setSearch("?film=webm");
    expect(forcedSource()).toBe(WEBM);
    setSearch("?film=mp4");
    expect(forcedSource()).toBe(HEVC);
  });

  it("ignores an unrecognised value", () => {
    setSearch("?film=vp8&other=1");
    expect(forcedSource()).toBeUndefined();
  });
});

describe("decodedWithAlpha", () => {
  // jsdom has no canvas, so `getContext` returns null — the fail-open path.
  it("fails open when the frame can't be read", () => {
    expect(
      decodedWithAlpha({ videoWidth: 1200, videoHeight: 770 } as HTMLVideoElement),
    ).toBe(true);
  });

  it("fails open before a frame has decoded", () => {
    expect(decodedWithAlpha({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement)).toBe(
      true,
    );
  });
});

describe("prefersReducedData", () => {
  // Safari and Firefox ship no `navigator.connection`, and neither does jsdom.
  it("is false when the connection API is absent", () => {
    expect(prefersReducedData()).toBe(false);
  });

  it("follows saveData when the connection API is present", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    expect(prefersReducedData()).toBe(true);
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false },
      configurable: true,
    });
    expect(prefersReducedData()).toBe(false);
    delete (navigator as { connection?: unknown }).connection;
  });
});
