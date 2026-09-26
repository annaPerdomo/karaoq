import { describe, it, expect, vi, afterEach } from "vitest";
import { startVisiblePolling } from "../../app/queue/pollWhileVisible";

afterEach(() => vi.useRealTimers());

describe("startVisiblePolling", () => {
  it("polls at a fixed interval", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, 1000);
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("re-reads a function interval before every tick", () => {
    vi.useFakeTimers();
    let slow = false;
    const fn = vi.fn(() => { slow = true; });
    const stop = startVisiblePolling(fn, () => (slow ? 20_000 : 1000));
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(19_999);
    expect(fn).toHaveBeenCalledTimes(1);
    slow = false;
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
  });
});
