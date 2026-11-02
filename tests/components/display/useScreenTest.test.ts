import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScreenTest } from "../../../components/display/hooks/useScreenTest";
import { broadcastScreenTest } from "../../../app/queue/roomChannel";
import { Room } from "../../../pages/api/types";

function room(screenTestAt: number | undefined, serverNow: number): Room {
  return { screenTestAt: screenTestAt ? new Date(screenTestAt) : undefined, serverNow } as unknown as Room;
}

afterEach(() => vi.useRealTimers());

describe("useScreenTest", () => {
  it("ignores a test sent before the display opened, shows a new one, then hides it", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScreenTest("ROOM1"));
    const now = Date.now();
    act(() => result.current.adoptRoom(room(now - 5000, now)));
    expect(result.current.showing).toBe(false);

    act(() => result.current.adoptRoom(room(now + 1000, now + 1500)));
    expect(result.current.showing).toBe(true);
    act(() => {
      vi.advanceTimersByTime(8100);
    });
    expect(result.current.showing).toBe(false);
  });

  it("does not show a stale test the poll only just saw", () => {
    const { result } = renderHook(() => useScreenTest("ROOM1"));
    const now = Date.now();
    act(() => result.current.adoptRoom(room(undefined, now)));
    act(() => result.current.adoptRoom(room(now - 60_000, now)));
    expect(result.current.showing).toBe(false);
  });

  it("shows instantly on a same-browser broadcast", async () => {
    const { result } = renderHook(() => useScreenTest("ROOM2"));
    await act(async () => {
      broadcastScreenTest("ROOM2");
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.showing).toBe(true);
  });
});
