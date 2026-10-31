import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

let listener: ((msg: { entryId: string; offsetSeconds: number }) => void) | null = null;
const onOriginalOffset = vi.fn((_roomId: string, cb: typeof listener) => {
  listener = cb;
  return () => {
    listener = null;
  };
});
vi.mock("../../app/queue/roomChannel", () => ({
  onOriginalOffset: (...args: Parameters<typeof onOriginalOffset>) => onOriginalOffset(...args),
}));

import { useEntryOffset } from "../../components/musicvideo/hooks/useEntryOffset";

function emit(msg: { entryId: string; offsetSeconds: number }) {
  listener?.(msg);
}

describe("useEntryOffset", () => {
  beforeEach(() => {
    listener = null;
    onOriginalOffset.mockClear();
  });

  it("starts from the polled value", () => {
    const { result } = renderHook(() => useEntryOffset("ROOM1", "e1", 1.5));
    expect(result.current).toBe(1.5);
  });

  it("a same-entry broadcast overrides the polled value immediately", () => {
    const { result } = renderHook(() => useEntryOffset("ROOM1", "e1", 1.5));
    act(() => emit({ entryId: "e1", offsetSeconds: 3 }));
    expect(result.current).toBe(3);
  });

  it("drops the override once a poll reports that same value", () => {
    const { result, rerender } = renderHook(
      ({ polled }: { polled: number }) => useEntryOffset("ROOM1", "e1", polled),
      { initialProps: { polled: 1.5 } }
    );
    act(() => emit({ entryId: "e1", offsetSeconds: 3 }));
    expect(result.current).toBe(3);

    rerender({ polled: 3 });
    expect(result.current).toBe(3);

    rerender({ polled: 2 });
    expect(result.current).toBe(2);
  });

  it("ignores a broadcast for a different entry", () => {
    const { result } = renderHook(() => useEntryOffset("ROOM1", "e1", 1.5));
    act(() => emit({ entryId: "e2", offsetSeconds: 9 }));
    expect(result.current).toBe(1.5);
  });

  it("clears a stale broadcast when the entry changes", () => {
    const { result, rerender } = renderHook(
      ({ entryId, polled }: { entryId: string; polled: number }) =>
        useEntryOffset("ROOM1", entryId, polled),
      { initialProps: { entryId: "e1", polled: 1.5 } }
    );
    act(() => emit({ entryId: "e1", offsetSeconds: 3 }));
    expect(result.current).toBe(3);

    rerender({ entryId: "e2", polled: 0 });
    expect(result.current).toBe(0);
  });
});
