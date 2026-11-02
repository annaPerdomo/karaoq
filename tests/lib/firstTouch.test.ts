import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  FIRST_TOUCH_KEY,
  FIRST_TOUCH_TTL_MS,
  sanitizeRef,
  sanitizeReferrerHost,
  sanitizeEntry,
  captureFirstTouch,
  getFirstTouch,
  firstTouchHeaders,
} from "../../lib/firstTouch";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeRef", () => {
  it("lowercases and strips disallowed characters", () => {
    expect(sanitizeRef("Reddit")).toBe("reddit");
    expect(sanitizeRef("r/karaoke!")).toBe("rkaraoke");
  });

  it("truncates to 40 characters", () => {
    expect(sanitizeRef("a".repeat(41))).toBe("a".repeat(40));
  });

  it("returns undefined for empty input", () => {
    expect(sanitizeRef("")).toBeUndefined();
    expect(sanitizeRef(null)).toBeUndefined();
    expect(sanitizeRef(undefined)).toBeUndefined();
  });
});

describe("sanitizeReferrerHost", () => {
  it("extracts and lowercases the hostname, stripping www", () => {
    expect(sanitizeReferrerHost("https://www.reddit.com/r/karaoke/")).toBe("reddit.com");
  });

  it("drops karaoq.live and its subdomains", () => {
    expect(sanitizeReferrerHost("https://www.karaoq.live/")).toBeUndefined();
    expect(sanitizeReferrerHost("https://sub.karaoq.live/")).toBeUndefined();
    expect(sanitizeReferrerHost("https://localhost:3000/")).toBeUndefined();
  });

  it("returns undefined for a non-URL", () => {
    expect(sanitizeReferrerHost("not a url")).toBeUndefined();
  });
});

describe("sanitizeEntry", () => {
  it("keeps a lowercased pathname, including room codes", () => {
    expect(sanitizeEntry("/ROOM1")).toBe("/room1");
  });

  it("requires a leading slash", () => {
    expect(sanitizeEntry("no-slash")).toBeUndefined();
  });

  it("truncates to 80 characters", () => {
    const long = "/" + "a".repeat(100);
    expect(sanitizeEntry(long)?.length).toBe(80);
  });
});

describe("captureFirstTouch", () => {
  it("writes on first visit", () => {
    captureFirstTouch("https://karaoq.live/?ref=guest-sing", "https://www.reddit.com/", 1000);
    const stored = getFirstTouch(1000);
    expect(stored).toMatchObject({
      ref: "guest-sing",
      referrer: "reddit.com",
      entry: "/",
      at: 1000,
    });
  });

  it("does not overwrite on a second visit with a different referrer and no ref", () => {
    captureFirstTouch("https://karaoq.live/ROOM1", "https://www.reddit.com/", 1000);
    captureFirstTouch("https://karaoq.live/ROOM2", "https://www.google.com/", 2000);
    const stored = getFirstTouch(2000);
    expect(stored).toMatchObject({ referrer: "reddit.com", entry: "/room1", at: 1000 });
  });

  it("overwrites only ref on a later visit carrying one", () => {
    captureFirstTouch("https://karaoq.live/ROOM1", "https://www.reddit.com/", 1000);
    captureFirstTouch("https://karaoq.live/?ref=guest-sing", "https://www.google.com/", 2000);
    const stored = getFirstTouch(2000);
    expect(stored).toMatchObject({
      ref: "guest-sing",
      referrer: "reddit.com",
      entry: "/room1",
      at: 2000,
    });
  });

  it("replaces an expired value", () => {
    captureFirstTouch("https://karaoq.live/ROOM1", "https://www.reddit.com/", 1000);
    const later = 1000 + FIRST_TOUCH_TTL_MS + 1;
    captureFirstTouch("https://karaoq.live/ROOM2", "https://www.google.com/", later);
    const stored = getFirstTouch(later);
    expect(stored).toMatchObject({ referrer: "google.com", entry: "/room2", at: later });
  });

  it("never throws when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() =>
      captureFirstTouch("https://karaoq.live/ROOM1", "https://www.reddit.com/", 1000)
    ).not.toThrow();
  });

  it("never throws when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => getFirstTouch(1000)).not.toThrow();
    expect(getFirstTouch(1000)).toBeNull();
  });
});

describe("firstTouchHeaders", () => {
  it("returns only the present fields as headers", () => {
    localStorage.setItem(
      FIRST_TOUCH_KEY,
      JSON.stringify({ ref: "reddit", entry: "/room1", at: Date.now() })
    );
    expect(firstTouchHeaders()).toEqual({
      "x-karaoq-ref": "reddit",
      "x-karaoq-entry": "/room1",
    });
  });

  it("captures first-touch itself when nothing is stored yet", () => {
    expect(localStorage.getItem(FIRST_TOUCH_KEY)).toBeNull();
    expect(firstTouchHeaders()).toEqual({ "x-karaoq-entry": "/" });
    expect(localStorage.getItem(FIRST_TOUCH_KEY)).not.toBeNull();
  });
});
