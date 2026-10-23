import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findMock = vi.fn();
const toArrayMock = vi.fn();

vi.mock("../../lib/mongodb", () => ({
  getFeatureFlagsCollection: vi.fn(async () => ({
    find: (...args: unknown[]) => {
      findMock(...args);
      return { toArray: toArrayMock };
    },
  })),
}));

import {
  FLAG_DEFAULTS,
  isFlagEnabled,
  invalidateFlagCache,
} from "../../lib/featureFlags";

beforeEach(() => {
  vi.clearAllMocks();
  invalidateFlagCache();
  toArrayMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isFlagEnabled", () => {
  it("returns the default when the collection is empty", async () => {
    toArrayMock.mockResolvedValue([]);
    expect(await isFlagEnabled("songs_pages")).toBe(FLAG_DEFAULTS.songs_pages);
  });

  it("reads a false doc", async () => {
    toArrayMock.mockResolvedValue([{ _id: "boards_posting", enabled: false }]);
    expect(await isFlagEnabled("boards_posting")).toBe(false);
  });

  it("ignores a malformed doc and falls back to the default", async () => {
    toArrayMock.mockResolvedValue([{ _id: "boards_posting", enabled: "nope" }]);
    expect(await isFlagEnabled("boards_posting")).toBe(FLAG_DEFAULTS.boards_posting);
  });

  it("honours the 60s cache — one find per window, then a background refresh", async () => {
    vi.useFakeTimers();
    toArrayMock.mockResolvedValue([{ _id: "corpus_cron", enabled: false }]);

    expect(await isFlagEnabled("corpus_cron")).toBe(false);
    expect(await isFlagEnabled("corpus_cron")).toBe(false);
    expect(findMock).toHaveBeenCalledTimes(1);

    toArrayMock.mockResolvedValue([{ _id: "corpus_cron", enabled: true }]);
    await vi.advanceTimersByTimeAsync(59_000);
    // Still under the stale window: served from cache, no new read yet.
    expect(await isFlagEnabled("corpus_cron")).toBe(false);
    expect(findMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    // Past 60s: a stale read returns the OLD value immediately (no block on
    // the DB) while the refresh happens in the background.
    expect(await isFlagEnabled("corpus_cron")).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(findMock).toHaveBeenCalledTimes(2);
    expect(await isFlagEnabled("corpus_cron")).toBe(true);
  });

  it("times out at 1s on a cold cache, then fills the cache when the read resolves late", async () => {
    vi.useFakeTimers();
    let resolveRead: (docs: unknown[]) => void = () => {};
    toArrayMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );

    const slow = isFlagEnabled("songs_pages");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await slow).toBe(FLAG_DEFAULTS.songs_pages);

    resolveRead([{ _id: "songs_pages", enabled: false }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await isFlagEnabled("songs_pages")).toBe(false);
  });

  it("returns the default on a read failure and never throws", async () => {
    toArrayMock.mockRejectedValue(new Error("down"));
    await expect(isFlagEnabled("songs_pages")).resolves.toBe(
      FLAG_DEFAULTS.songs_pages
    );
  });

  it("on a read failure, keeps the previous map and retries after 5s (not 60s)", async () => {
    vi.useFakeTimers();
    toArrayMock.mockResolvedValue([{ _id: "boards_posting", enabled: false }]);
    expect(await isFlagEnabled("boards_posting")).toBe(false);
    expect(findMock).toHaveBeenCalledTimes(1);

    toArrayMock.mockRejectedValue(new Error("down"));
    // The 60s staleness timer only flips a flag; the next read is what
    // actually kicks off (and, here, fails) the background refresh.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await isFlagEnabled("boards_posting")).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(findMock).toHaveBeenCalledTimes(2);

    toArrayMock.mockResolvedValue([{ _id: "boards_posting", enabled: true }]);
    // Within the 5s failure backoff: no retry yet.
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await isFlagEnabled("boards_posting")).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(findMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);
    // Past the 5s backoff: this call kicks the retry off (still answering
    // with the stale value) and the next call sees the refreshed one.
    expect(await isFlagEnabled("boards_posting")).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(findMock).toHaveBeenCalledTimes(3);
    expect(await isFlagEnabled("boards_posting")).toBe(true);
  });

  it("a warm, stale read returns immediately without awaiting the DB", async () => {
    vi.useFakeTimers();
    toArrayMock.mockResolvedValue([{ _id: "songs_pages", enabled: true }]);
    expect(await isFlagEnabled("songs_pages")).toBe(true);
    await vi.advanceTimersByTimeAsync(61_000);

    // Never resolves — if isFlagEnabled awaited this, the assertion below
    // would hang instead of resolving.
    toArrayMock.mockReturnValue(new Promise(() => {}));
    await expect(isFlagEnabled("songs_pages")).resolves.toBe(true);
  });

  it("refreshes on read via performance.now() when a frozen instance's timer never fires", async () => {
    let perfNow = 1_000;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => perfNow);

    try {
      toArrayMock.mockResolvedValue([{ _id: "corpus_cron", enabled: false }]);
      expect(await isFlagEnabled("corpus_cron")).toBe(false);
      expect(findMock).toHaveBeenCalledTimes(1);

      // No timer (real or fake) ever fires — perf time alone jumps past the
      // 60s window, as it would on an instance frozen between requests.
      perfNow += 61_000;
      toArrayMock.mockResolvedValue([{ _id: "corpus_cron", enabled: true }]);
      expect(await isFlagEnabled("corpus_cron")).toBe(false);

      await new Promise((resolve) => setImmediate(resolve));
      expect(findMock).toHaveBeenCalledTimes(2);
      expect(await isFlagEnabled("corpus_cron")).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
