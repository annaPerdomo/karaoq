import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoStart } from "../../components/hooks/useAutoStart";
import { autoStartFor } from "../../lib/externalEntry";
import { resetClockSkew } from "../../lib/clockSkew";

describe("auto-start with an armed stamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T20:00:00.000Z"));
    resetClockSkew();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetClockSkew();
  });

  function run(entry: { external?: true }) {
    const onStart = vi.fn();
    const stamp = Date.now() + 3000;
    const { result } = renderHook(() =>
      useAutoStart({ autoStartAt: autoStartFor(entry, stamp), isPlaying: false, canStart: true, onStart })
    );
    act(() => { vi.advanceTimersByTime(5000); });
    return { onStart, result };
  }

  it("never starts an external entry and shows no countdown", () => {
    const { onStart, result } = run({ external: true });
    expect(onStart).not.toHaveBeenCalled();
    expect(result.current.secondsLeft).toBeNull();
  });

  it("still starts a normal entry", () => {
    expect(run({}).onStart).toHaveBeenCalledTimes(1);
  });
});

import { useEntryAutoStartStamp } from "../../components/hooks/useEntryAutoStartStamp";

describe("a stamp that lapsed while an external entry held the stage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T20:00:00.000Z"));
    resetClockSkew();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetClockSkew();
  });

  it("does not instant-start once the entry stops being external", () => {
    const onStart = vi.fn();
    const stamp = Date.now() + 3000;
    const { rerender } = renderHook(
      (entry: { external?: true }) =>
        useAutoStart({
          autoStartAt: useEntryAutoStartStamp(entry, stamp),
          isPlaying: false,
          canStart: true,
          onStart,
        }),
      { initialProps: { external: true as const } as { external?: true } }
    );
    act(() => { vi.advanceTimersByTime(5000); });

    rerender({});
    act(() => { vi.advanceTimersByTime(1000); });

    expect(onStart).not.toHaveBeenCalled();
  });

  it("still passes a future stamp straight through for a normal entry", () => {
    const onStart = vi.fn();
    const stamp = Date.now() + 3000;
    renderHook(() => useAutoStart({ autoStartAt: useEntryAutoStartStamp({}, stamp), isPlaying: false, canStart: true, onStart }));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("passes a new stamp for the next song even when it has already lapsed", () => {
    const held = Date.now() + 3000;
    const { result, rerender } = renderHook(
      (p: { entry: { external?: true }; stamp: number | null }) => useEntryAutoStartStamp(p.entry, p.stamp),
      { initialProps: { entry: { external: true as const }, stamp: held } as { entry: { external?: true }; stamp: number | null } }
    );
    expect(result.current).toBeNull();

    const fresh = Date.now() - 2000;
    rerender({ entry: {}, stamp: fresh });
    expect(result.current).toBe(fresh);
  });

  it("keeps hiding the stamp the external entry sat on", () => {
    const held = Date.now() + 3000;
    const { result, rerender } = renderHook(
      (p: { entry: { external?: true }; stamp: number | null }) => useEntryAutoStartStamp(p.entry, p.stamp),
      { initialProps: { entry: { external: true as const }, stamp: held } as { entry: { external?: true }; stamp: number | null } }
    );
    rerender({ entry: {}, stamp: held });
    expect(result.current).toBeNull();
  });
});
