import { describe, it, expect } from "vitest";
import {
  isValidDisplayConfig,
  isValidQueueEntry,
  markRateLimitNotified,
  MAX_BANNER_LENGTH,
  MAX_FEEDBACK_CONTACT_LENGTH,
  MAX_FEEDBACK_LENGTH,
  rateLimit,
  sanitizeFeedback,
  sanitizeSongDuration,
} from "../../lib/limits";
import { createMockReq } from "../helpers/mockRequest";
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig } from "../../pages/api/types";

describe("markRateLimitNotified", () => {
  // Distinct IPs per test: the bucket map is module state.
  const reqFrom = (ip: string) =>
    createMockReq({ headers: { "x-forwarded-for": ip } });

  it("fires once for a bucket, then stays quiet", () => {
    const req = reqFrom("203.0.113.1");
    rateLimit(req, "notify-test", 1, 60_000);

    expect(markRateLimitNotified(req, "notify-test")).toBe(true);
    expect(markRateLimitNotified(req, "notify-test")).toBe(false);
    expect(markRateLimitNotified(req, "notify-test")).toBe(false);
  });

  it("does not fire for an IP that has no bucket yet", () => {
    expect(markRateLimitNotified(reqFrom("203.0.113.2"), "notify-test")).toBe(false);
  });

  it("keeps one caller's silence from muting another", () => {
    const a = reqFrom("203.0.113.3");
    const b = reqFrom("203.0.113.4");
    rateLimit(a, "notify-test", 1, 60_000);
    rateLimit(b, "notify-test", 1, 60_000);

    expect(markRateLimitNotified(a, "notify-test")).toBe(true);
    expect(markRateLimitNotified(b, "notify-test")).toBe(true);
  });

  it("becomes reportable again once the window rolls over", () => {
    const req = reqFrom("203.0.113.5");
    rateLimit(req, "notify-test", 1, 1); // 1ms window
    expect(markRateLimitNotified(req, "notify-test")).toBe(true);

    return new Promise<void>((resolve) =>
      setTimeout(() => {
        rateLimit(req, "notify-test", 1, 60_000);
        expect(markRateLimitNotified(req, "notify-test")).toBe(true);
        resolve();
      }, 5)
    );
  });
});

describe("sanitizeSongDuration", () => {
  it("keeps a plausible song length, as whole seconds", () => {
    expect(sanitizeSongDuration(245)).toBe(245);
    expect(sanitizeSongDuration(245.6)).toBe(246);
  });

  it("drops lengths no karaoke track has", () => {
    expect(sanitizeSongDuration(5)).toBeUndefined(); // a clip
    expect(sanitizeSongDuration(86_400)).toBeUndefined(); // a livestream
  });

  it("drops anything that isn't a finite number", () => {
    expect(sanitizeSongDuration(undefined)).toBeUndefined();
    expect(sanitizeSongDuration("240")).toBeUndefined();
    expect(sanitizeSongDuration(NaN)).toBeUndefined();
  });

  it("leaves a queue entry valid whether or not it carries a length", () => {
    const entry = {
      id: "e1",
      userName: "Anna",
      songTitle: "Song",
      videoId: "dQw4w9WgXcQ",
    };
    expect(isValidQueueEntry(entry)).toBe(true);
    expect(isValidQueueEntry({ ...entry, durationSeconds: 240 })).toBe(true);
    expect(isValidQueueEntry({ ...entry, durationSeconds: 3 })).toBe(false);
  });
});

describe("isValidDisplayConfig", () => {
  it("accepts the default config", () => {
    expect(isValidDisplayConfig(DEFAULT_DISPLAY_CONFIG)).toBe(true);
  });

  it("accepts a fully populated valid config", () => {
    const config: DisplayConfig = {
      qrSize: "hidden",
      qrPx: 300,
      showUpNext: false,
      upNextCount: 16,
      showNowPlaying: false,
      theme: "neon",
      sidebarPosition: "left",
      sidebarWidth: 460,
      sidebarOrder: ["banner", "upNext", "qr", "boards"],
      bannerLine: "x".repeat(MAX_BANNER_LENGTH),
      bannerPx: 64,
      nowPlayingHeight: 420,
    };
    expect(isValidDisplayConfig(config)).toBe(true);
  });

  it("accepts a config without the drag-era fields (older clients)", () => {
    const {
      qrPx: _q,
      sidebarPosition: _p,
      sidebarWidth: _w,
      sidebarOrder: _o,
      nowPlayingHeight: _h,
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
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, qrPx: 301 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarWidth: 219 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarWidth: 461 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, nowPlayingHeight: 99 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, nowPlayingHeight: 421 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, bannerPx: 13 })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, bannerPx: 65 })).toBe(false);
  });

  it("rejects a sidebarOrder that is not a permutation of all sections", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarOrder: ["qr"] })).toBe(false);
    expect(
      isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, sidebarOrder: ["qr", "qr", "banner"] })
    ).toBe(false);
  });

  it("rejects a non-boolean showNowPlaying", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, showNowPlaying: 1 })).toBe(false);
  });

  // A config still carrying the retired showReactions is rejected.
  it("rejects the retired showReactions field", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, showReactions: true })).toBe(false);
  });

  it("rejects an invalid theme", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, theme: "disco" })).toBe(false);
  });

  it("rejects a non-string bannerLine", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, bannerLine: 5 })).toBe(false);
  });

  it("rejects a missing bannerLine", () => {
    const { bannerLine: _b, ...rest } = DEFAULT_DISPLAY_CONFIG;
    expect(isValidDisplayConfig(rest)).toBe(false);
  });

  it("rejects a bannerLine over the max length", () => {
    expect(
      isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, bannerLine: "x".repeat(MAX_BANNER_LENGTH + 1) })
    ).toBe(false);
  });

  // Configs still carrying retired welcomeLine/attractMode are rejected.
  it("rejects the retired welcomeLine and attractMode fields", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, welcomeLine: "hi" })).toBe(false);
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, attractMode: false })).toBe(false);
  });

  it("rejects unknown extra keys", () => {
    expect(isValidDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, extra: true })).toBe(false);
  });
});

describe("sanitizeFeedback", () => {
  it("keeps a full submission, trimmed", () => {
    expect(
      sanitizeFeedback({
        kind: "bug",
        message: "  The queue froze mid-song  ",
        contact: " anna@example.com ",
        roomId: "ABC123",
        role: "host",
        page: "/host/ABC123",
      })
    ).toEqual({
      kind: "bug",
      message: "The queue froze mid-song",
      contact: "anna@example.com",
      roomId: "ABC123",
      role: "host",
      page: "/host/ABC123",
    });
  });

  it("rejects a submission with nothing to read", () => {
    expect(sanitizeFeedback({ kind: "bug", message: "   " })).toBeNull();
    expect(sanitizeFeedback({ kind: "bug" })).toBeNull();
    expect(sanitizeFeedback(null)).toBeNull();
  });

  it("rejects an over-long message rather than truncating someone's report", () => {
    expect(
      sanitizeFeedback({ message: "x".repeat(MAX_FEEDBACK_LENGTH + 1) })
    ).toBeNull();
    expect(
      sanitizeFeedback({ message: "x".repeat(MAX_FEEDBACK_LENGTH) })
    ).not.toBeNull();
  });

  it("falls back on every other field instead of losing the message", () => {
    expect(
      sanitizeFeedback({
        kind: "nonsense",
        message: "hi",
        contact: "x".repeat(MAX_FEEDBACK_CONTACT_LENGTH + 1),
        roomId: 42,
        role: "display",
        page: "",
      })
    ).toEqual({
      kind: "other",
      message: "hi",
      contact: "",
      roomId: undefined,
      role: undefined,
      page: undefined,
    });
  });
});
