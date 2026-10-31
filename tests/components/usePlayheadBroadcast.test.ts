import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const broadcastPlayhead = vi.fn();
vi.mock("../../app/queue/roomChannel", () => ({
  broadcastPlayhead: (...args: unknown[]) => broadcastPlayhead(...args),
}));

import { usePlayheadBroadcast } from "../../components/display/hooks/usePlayheadBroadcast";

describe("usePlayheadBroadcast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    broadcastPlayhead.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("broadcasts a pause at once, with the last known position", () => {
    const { result } = renderHook(() => usePlayheadBroadcast("ROOM1", "e1"));
    result.current(42, 1);
    broadcastPlayhead.mockClear();
    result.current(null, 2);
    expect(broadcastPlayhead).toHaveBeenCalledTimes(1);
    expect(broadcastPlayhead.mock.calls[0][1]).toMatchObject({ entryId: "e1", seconds: 42, playing: false });
  });

  it("keeps repeating a pause so it never goes stale", () => {
    const { result } = renderHook(() => usePlayheadBroadcast("ROOM1", "e1"));
    result.current(42, 2);
    broadcastPlayhead.mockClear();
    vi.advanceTimersByTime(3000);
    expect(broadcastPlayhead.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(broadcastPlayhead.mock.calls.every((c) => c[1].playing === false)).toBe(true);
  });

  it("does not repeat while playing; infoDelivery carries that", () => {
    const { result } = renderHook(() => usePlayheadBroadcast("ROOM1", "e1"));
    result.current(42, 1);
    broadcastPlayhead.mockClear();
    vi.advanceTimersByTime(3000);
    expect(broadcastPlayhead).not.toHaveBeenCalled();
  });

  it("stays silent without a room, as on a host device that isn't playing", () => {
    const { result } = renderHook(() => usePlayheadBroadcast(undefined, "e1"));
    result.current(42, 2);
    vi.advanceTimersByTime(3000);
    expect(broadcastPlayhead).not.toHaveBeenCalled();
  });
});
