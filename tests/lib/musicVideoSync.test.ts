import { describe, it, expect } from "vitest";
import {
  DRIFT_SEEK_S,
  PLAYHEAD_FRESH_MS,
  SEEK_COOLDOWN_MS,
  canSeek,
  originalEnded,
  serverPlayhead,
  syncAction,
  targetSeconds,
} from "../../lib/musicVideoSync";

describe("musicVideoSync - serverPlayhead", () => {
  it("returns null when not playing", () => {
    expect(serverPlayhead({ isPlaying: false, playStartedAt: new Date().toISOString() }, Date.now())).toBeNull();
  });

  it("returns null with no start time", () => {
    expect(serverPlayhead({ isPlaying: true }, Date.now())).toBeNull();
  });

  it("counts up from playStartedAt while playing", () => {
    const now = Date.now();
    const startedAt = new Date(now - 10_000).toISOString();
    expect(serverPlayhead({ isPlaying: true, playStartedAt: startedAt }, now)).toBeCloseTo(10, 0);
  });

  it("freezes at the pause instant while playPausedAt is set", () => {
    const now = Date.now();
    const startedAt = new Date(now - 20_000).toISOString();
    const pausedAt = new Date(now - 5_000).toISOString();
    expect(
      serverPlayhead({ isPlaying: true, playStartedAt: startedAt, playPausedAt: pausedAt }, now)
    ).toBeCloseTo(15, 0);
  });

  it("never goes negative", () => {
    const now = Date.now();
    const startedAt = new Date(now + 5_000).toISOString();
    expect(serverPlayhead({ isPlaying: true, playStartedAt: startedAt }, now)).toBe(0);
  });
});

describe("musicVideoSync - targetSeconds", () => {
  const now = 1_000_000;

  it("prefers a fresh same-entry playhead over the server estimate", () => {
    const playhead = { entryId: "a", seconds: 30, playing: true, sentAt: now - 1000 };
    const target = targetSeconds(10, playhead, "a", now, 0);
    expect(target).toBeCloseTo(31, 0);
  });

  it("ignores a stale playhead", () => {
    const playhead = { entryId: "a", seconds: 30, playing: true, sentAt: now - (PLAYHEAD_FRESH_MS + 1) };
    expect(targetSeconds(10, playhead, "a", now, 0)).toBe(10);
  });

  it("ignores a playhead for a different entry", () => {
    const playhead = { entryId: "b", seconds: 30, playing: true, sentAt: now };
    expect(targetSeconds(10, playhead, "a", now, 0)).toBe(10);
  });

  it("applies the offset and clamps at 0", () => {
    expect(targetSeconds(2, null, "a", now, -5)).toBe(0);
    expect(targetSeconds(10, null, "a", now, 3)).toBe(13);
  });

  it("stays null when there is nothing to go on", () => {
    expect(targetSeconds(null, null, "a", now, 0)).toBeNull();
  });
});

describe("musicVideoSync - syncAction", () => {
  it("seeks when current is null", () => {
    expect(syncAction(null, 10, true)).toEqual({ seekTo: 10, play: true });
  });

  it("does not seek within the drift tolerance", () => {
    expect(syncAction(10, 10 + DRIFT_SEEK_S - 0.1, true)).toEqual({ play: true });
  });

  it("seeks past the drift tolerance", () => {
    expect(syncAction(10, 10 + DRIFT_SEEK_S + 0.1, true)).toEqual({
      seekTo: 10 + DRIFT_SEEK_S + 0.1,
      play: true,
    });
  });

  it("mirrors playing with no target", () => {
    expect(syncAction(10, null, false)).toEqual({ play: false });
  });
});

describe("musicVideoSync - canSeek", () => {
  it("refuses while buffering (state 3), regardless of cooldown", () => {
    expect(canSeek(3, 0, 1000)).toBe(false);
  });

  it("refuses during the cooldown window after a seek", () => {
    const seekAt = 1000;
    expect(canSeek(1, seekAt + SEEK_COOLDOWN_MS, seekAt + SEEK_COOLDOWN_MS - 1)).toBe(false);
  });

  it("allows once the cooldown has elapsed and the player isn't buffering", () => {
    const seekAt = 1000;
    expect(canSeek(1, seekAt + SEEK_COOLDOWN_MS, seekAt + SEEK_COOLDOWN_MS)).toBe(true);
  });
});

describe("musicVideoSync - originalEnded", () => {
  it("is false without a known duration", () => {
    expect(originalEnded(200, null, 0)).toBe(false);
  });

  it("is false when the target hasn't reached the duration yet", () => {
    expect(originalEnded(150, 200, 0)).toBe(false);
  });

  it("is false on state 0 if the target is stale/behind, even past the duration numerically", () => {
    expect(originalEnded(null, 200, 0)).toBe(false);
  });

  it("is true once the target reaches the duration and the player reports ended", () => {
    expect(originalEnded(200, 200, 0)).toBe(true);
    expect(originalEnded(210, 200, 0)).toBe(true);
  });

  it("is false if the player hasn't reported state 0, even past the duration", () => {
    expect(originalEnded(210, 200, 1)).toBe(false);
  });
});
