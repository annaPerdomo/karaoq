import { describe, it, expect } from "vitest";
import { normalizeAutoAdvance, normalizeSongLimit, AUTO_ADVANCE_OFF } from "../../pages/api/types";
import { autoStartEpoch, playerCurrentTime, songSecondsLeft } from "../../lib/autoAdvance";

describe("normalizeAutoAdvance", () => {
  it("treats an absent setting as off — those rooms predate auto-advance", () => {
    expect(normalizeAutoAdvance(undefined)).toEqual(AUTO_ADVANCE_OFF);
    expect(normalizeAutoAdvance(null)).toEqual(AUTO_ADVANCE_OFF);
    expect(normalizeAutoAdvance("yes")).toEqual(AUTO_ADVANCE_OFF);
  });

  it("keeps offered values and snaps everything else", () => {
    expect(normalizeAutoAdvance({ enabled: true, gapSeconds: 30 })).toEqual({
      enabled: true,
      gapSeconds: 30,
    });
    // Only an explicit true switches it on.
    expect(normalizeAutoAdvance({ enabled: "yes", gapSeconds: 7 })).toEqual({
      enabled: false,
      gapSeconds: 10,
    });
    expect(normalizeAutoAdvance({ enabled: false })).toEqual({ enabled: false, gapSeconds: 10 });
  });

  it("drops unknown keys, including the limit that used to live here", () => {
    const out = normalizeAutoAdvance({ enabled: true, maxSongSeconds: 240 }) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["enabled", "gapSeconds"]);
  });
});

describe("normalizeSongLimit", () => {
  it("accepts only the offered limits", () => {
    expect(normalizeSongLimit(240)).toBe(240);
    expect(normalizeSongLimit(239)).toBeNull();
    expect(normalizeSongLimit("240")).toBeNull();
    expect(normalizeSongLimit(undefined)).toBeNull();
  });
});

describe("playerCurrentTime", () => {
  it("reads currentTime off an infoDelivery message only", () => {
    expect(playerCurrentTime({ event: "infoDelivery", info: { currentTime: 12.5 } })).toBe(12.5);
    expect(playerCurrentTime({ event: "onStateChange", info: 1 })).toBeNull();
    expect(playerCurrentTime({ event: "infoDelivery", info: { playerState: 1 } })).toBeNull();
    expect(playerCurrentTime("nope")).toBeNull();
    expect(playerCurrentTime(null)).toBeNull();
  });
});

describe("songSecondsLeft", () => {
  it("is null with no limit or no position", () => {
    expect(songSecondsLeft(10, null)).toBeNull();
    expect(songSecondsLeft(null, 180)).toBeNull();
  });

  it("counts whole seconds down to zero and never below", () => {
    expect(songSecondsLeft(170.2, 180)).toBe(10);
    expect(songSecondsLeft(180, 180)).toBe(0);
    expect(songSecondsLeft(400, 180)).toBe(0);
  });
});

describe("autoStartEpoch", () => {
  it("accepts a Date or its ISO form and rejects the rest", () => {
    const at = new Date("2026-09-05T20:00:00.000Z");
    expect(autoStartEpoch(at)).toBe(at.getTime());
    expect(autoStartEpoch(at.toISOString())).toBe(at.getTime());
    expect(autoStartEpoch(undefined)).toBeNull();
    expect(autoStartEpoch("not a date")).toBeNull();
    expect(autoStartEpoch(123)).toBeNull();
  });
});
