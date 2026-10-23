import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useEndedCheer } from "../../components/hooks/useEndedCheer";
import { CHEER_WINDOW_MS } from "../../components/host/stageTiming";

/** Mirrors Host.applyRoomState: seed the page-load marker, then adopt it. */
function setup(initial: string | null) {
  const hook = renderHook(({ ended }) => useEndedCheer(ended), {
    initialProps: { ended: null as string | null },
  });
  if (hook.result.current.preEndedRef.current === undefined) {
    hook.result.current.preEndedRef.current = initial;
  }
  hook.rerender({ ended: initial });
  return hook;
}

describe("useEndedCheer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never cheers the marker the page loaded with", () => {
    const { result } = setup("a");
    expect(result.current.cheerEntryId).toBeNull();
  });

  it("cheers a song that ends while the page is open", () => {
    const { result, rerender } = setup("a");
    rerender({ ended: "b" });
    expect(result.current.cheerEntryId).toBe("b");
  });

  it("cheers in the same render the marker lands, before any effect runs", () => {
    const seen: (string | null)[] = [];
    const { rerender } = renderHook(
      ({ ended }) => {
        const r = useEndedCheer(ended);
        if (r.preEndedRef.current === undefined) r.preEndedRef.current = "a";
        seen.push(r.cheerEntryId);
        return r;
      },
      { initialProps: { ended: "a" as string | null } }
    );
    rerender({ ended: "b" });
    expect(seen[1]).toBe("b");
  });

  it("stops cheering once the window closes, however long the wait runs", () => {
    const { result, rerender } = setup(null);
    rerender({ ended: "b" });
    act(() => {
      vi.advanceTimersByTime(CHEER_WINDOW_MS);
    });
    expect(result.current.cheerEntryId).toBeNull();
    rerender({ ended: "b" });
    expect(result.current.cheerEntryId).toBeNull();
  });

  it("drops the cheer when the marker clears", () => {
    const { result, rerender } = setup(null);
    rerender({ ended: "b" });
    rerender({ ended: null });
    expect(result.current.cheerEntryId).toBeNull();
  });
});
