import { describe, it, expect, vi, afterEach } from "vitest";
import {
  musicVideoChipLabel,
  musicVideoTouched,
} from "../../components/admin/rooms/MusicVideoPanel";
import { summarizeRoomMusicVideo } from "../../lib/roomMusicVideo";

const NOW = new Date("2026-11-05T20:00:00.000Z");

function wire(overrides: Partial<ReturnType<typeof summarizeRoomMusicVideo>> = {}) {
  const mv = { ...summarizeRoomMusicVideo([], null), ...overrides };
  return {
    ...mv,
    lastSeenAt: mv.lastSeenAt ? new Date(mv.lastSeenAt).toISOString() : null,
    firstOpenedAt: mv.firstOpenedAt ? new Date(mv.firstOpenedAt).toISOString() : null,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("music-video dossier chip", () => {
  it("hides the panel for a room that never touched it", () => {
    expect(musicVideoTouched(wire())).toBe(false);
    expect(musicVideoTouched(undefined)).toBe(false);
  });

  it("calls out a host who opened the link but never loaded a screen", () => {
    const mv = wire({ links: { open: 1, copy: 0 } });
    expect(musicVideoTouched(mv)).toBe(true);
    expect(musicVideoChipLabel(mv)).toBe("Music video: link only, no screen");
  });

  it("shows a heartbeat-only room as used", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const mv = wire({ lastSeenAt: new Date(NOW.getTime() - 60 * 60 * 1000) });
    expect(musicVideoTouched(mv)).toBe(true);
    expect(musicVideoChipLabel(mv)).toBe("Music video: used");
  });

  it("is on now while the screen has checked in within 12 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const mv = wire({ lastSeenAt: new Date(NOW.getTime() - 6 * 60 * 1000) });
    expect(musicVideoChipLabel(mv)).toBe("Music video: on now");
  });
});
