import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoStart } from "../../components/hooks/useAutoStart";
import { recordServerTime, resetClockSkew } from "../../lib/clockSkew";

describe("useAutoStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T20:00:00.000Z"));
    resetClockSkew();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetClockSkew();
  });

  function stampIn(ms: number) {
    return Date.now() + ms;
  }

  it("shows no countdown without a stamp, or while a song plays", () => {
    const onStart = vi.fn();
    const { result, rerender } = renderHook(
      (props: { autoStartAt: number | null; isPlaying: boolean }) =>
        useAutoStart({ ...props, canStart: true, onStart }),
      { initialProps: { autoStartAt: null, isPlaying: false } }
    );
    expect(result.current.secondsLeft).toBeNull();

    rerender({ autoStartAt: stampIn(5000), isPlaying: true });
    expect(result.current.secondsLeft).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("counts down in whole seconds and fires the start once", () => {
    const onStart = vi.fn();
    // Fixed once: a stamp recomputed per render would re-arm the countdown.
    const autoStartAt = stampIn(3000);
    const { result } = renderHook(() =>
      useAutoStart({ autoStartAt, isPlaying: false, canStart: true, onStart })
    );
    expect(result.current.secondsLeft).toBe(3);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.secondsLeft).toBe(2);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.secondsLeft).toBe(0);
    expect(onStart).toHaveBeenCalledTimes(1);

    // Later ticks on the same stamp must not start it again.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("refuses a stamp that lapsed before the surface mounted", () => {
    // A display closed through the breather and reopened: nobody was around to
    // run this countdown, so starting it now would blast a song with no
    // countdown ever shown.
    const onStart = vi.fn();
    const autoStartAt = stampIn(-8000);
    const { result } = renderHook(() =>
      useAutoStart({ autoStartAt, isPlaying: false, canStart: true, onStart })
    );

    expect(result.current.secondsLeft).toBe(0);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onStart).not.toHaveBeenCalled();
  });

  it("still fires a stamp a gap change re-times into the past", () => {
    // The surface was here when the countdown was armed, so the host shrinking
    // the gap mid-countdown starts the song immediately, as the route intends.
    const onStart = vi.fn();
    const { rerender } = renderHook(
      (props: { autoStartAt: number }) =>
        useAutoStart({ ...props, isPlaying: false, canStart: true, onStart }),
      { initialProps: { autoStartAt: stampIn(30_000) } }
    );
    expect(onStart).not.toHaveBeenCalled();

    // 20s into a 30s breather the host picks the 5s gap: the route re-measures
    // from when the breather began, landing the stamp 15s ago — but still well
    // after this surface mounted.
    act(() => { vi.advanceTimersByTime(20_000); });
    const restamped = Date.now() - 15_000;
    act(() => { rerender({ autoStartAt: restamped }); });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("only counts on a surface that cannot start (a host page in TV mode)", () => {
    const onStart = vi.fn();
    const autoStartAt = stampIn(1000);
    const { result } = renderHook(() =>
      useAutoStart({ autoStartAt, isPlaying: false, canStart: false, onStart })
    );
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.secondsLeft).toBe(0);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("measures against the server's clock, not the device's", () => {
    // The phone runs 10s fast: a stamp 3s out by the server's clock reads as
    // 3s here too, not as already lapsed.
    recordServerTime(Date.now() - 10_000);
    const onStart = vi.fn();
    const autoStartAt = Date.now() - 10_000 + 3000;
    const { result } = renderHook(() =>
      useAutoStart({ autoStartAt, isPlaying: false, canStart: true, onStart })
    );
    expect(result.current.secondsLeft).toBe(3);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("fires again for a fresh stamp after the first song ends", () => {
    const onStart = vi.fn();
    const { rerender } = renderHook(
      (props: { autoStartAt: number | null; isPlaying: boolean }) =>
        useAutoStart({ ...props, canStart: true, onStart }),
      { initialProps: { autoStartAt: stampIn(1000), isPlaying: false } }
    );
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender({ autoStartAt: null, isPlaying: true });
    rerender({ autoStartAt: stampIn(1000), isPlaying: false });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onStart).toHaveBeenCalledTimes(2);
  });
});
