import { describe, it, expect } from "vitest";
import { DORMANT_AFTER_MS, isRoomDormant } from "../../lib/roomDormancy";

const now = Date.parse("2026-09-26T20:00:00Z");
const ago = (ms: number) => new Date(now - ms);

describe("isRoomDormant", () => {
  it("is dormant once nothing has been written for the window and nothing plays", () => {
    expect(isRoomDormant({ isPlaying: false, lastActivity: ago(DORMANT_AFTER_MS + 1), serverNow: now })).toBe(true);
  });

  it("stays awake inside the window", () => {
    expect(isRoomDormant({ isPlaying: false, lastActivity: ago(DORMANT_AFTER_MS - 1000), serverNow: now })).toBe(false);
  });

  it("never sleeps while a song plays", () => {
    expect(isRoomDormant({ isPlaying: true, lastActivity: ago(DORMANT_AFTER_MS * 3), serverNow: now })).toBe(false);
  });

  it("stays awake when it can't tell (legacy rooms, no server clock)", () => {
    expect(isRoomDormant({ isPlaying: false, serverNow: now })).toBe(false);
    expect(isRoomDormant({ isPlaying: false, lastActivity: ago(DORMANT_AFTER_MS * 3) })).toBe(false);
  });

  it("reads lastActivity as the ISO string JSON delivers", () => {
    const iso = ago(DORMANT_AFTER_MS + 1).toISOString() as unknown as Date;
    expect(isRoomDormant({ isPlaying: false, lastActivity: iso, serverNow: now })).toBe(true);
  });
});
