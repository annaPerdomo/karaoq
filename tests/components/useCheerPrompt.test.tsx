import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCheerPrompt } from "../../components/display/hooks/useCheerPrompt";

const base = { active: true, audience: true, cheerCount: 0, roomHasCheered: false };

describe("useCheerPrompt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("nudges once when a song goes 20s with no cheer", () => {
    const onPrompt = vi.fn();
    renderHook(() => useCheerPrompt({ ...base, songId: "s1", onPrompt }));
    vi.advanceTimersByTime(19_000);
    expect(onPrompt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onPrompt).toHaveBeenCalledWith("s1");
    vi.advanceTimersByTime(60_000);
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it("stays quiet with cheers off, in Customize, or with no audience", () => {
    const onPrompt = vi.fn();
    renderHook(() => useCheerPrompt({ ...base, active: false, songId: "s1", onPrompt }));
    renderHook(() => useCheerPrompt({ ...base, audience: false, songId: "s1", onPrompt }));
    vi.advanceTimersByTime(30_000);
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it("drops the nudge once the song gets a cheer", () => {
    const onPrompt = vi.fn();
    const { rerender } = renderHook((p: { cheerCount: number }) => useCheerPrompt({ ...base, songId: "s1", onPrompt, cheerCount: p.cheerCount }), { initialProps: { cheerCount: 0 } });
    vi.advanceTimersByTime(10_000);
    rerender({ cheerCount: 1 });
    vi.advanceTimersByTime(20_000);
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it("nudges a song once even if playback pauses and resumes", () => {
    const onPrompt = vi.fn();
    const { rerender } = renderHook((p: { active: boolean }) => useCheerPrompt({ ...base, songId: "s1", onPrompt, active: p.active }), { initialProps: { active: true } });
    vi.advanceTimersByTime(20_000);
    rerender({ active: false });
    rerender({ active: true });
    vi.advanceTimersByTime(20_000);
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it("stays quiet on a screen that loads into a room that has already cheered", () => {
    const onPrompt = vi.fn();
    renderHook(() => useCheerPrompt({ ...base, songId: "s1", onPrompt, roomHasCheered: true }));
    vi.advanceTimersByTime(30_000);
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it("stops for the session after two quiet songs", () => {
    const onPrompt = vi.fn();
    const { rerender } = renderHook((p: { songId: string }) => useCheerPrompt({ ...base, onPrompt, songId: p.songId }), { initialProps: { songId: "s1" } });
    vi.advanceTimersByTime(20_000);
    rerender({ songId: "s2" });
    vi.advanceTimersByTime(20_000);
    expect(onPrompt).toHaveBeenCalledTimes(2);
    rerender({ songId: "s3" });
    vi.advanceTimersByTime(20_000);
    rerender({ songId: "s4" });
    vi.advanceTimersByTime(20_000);
    expect(onPrompt).toHaveBeenCalledTimes(2);
  });

  it("never comes back once the room has cheered at all", () => {
    const onPrompt = vi.fn();
    const { rerender } = renderHook((p: { songId: string; cheerCount: number }) => useCheerPrompt({ ...base, onPrompt, ...p }), { initialProps: { songId: "s1", cheerCount: 0 } });
    rerender({ songId: "s1", cheerCount: 3 });
    // Next song, count reset to zero: the room already knows how to cheer.
    rerender({ songId: "s2", cheerCount: 0 });
    vi.advanceTimersByTime(30_000);
    expect(onPrompt).not.toHaveBeenCalled();
  });
});
