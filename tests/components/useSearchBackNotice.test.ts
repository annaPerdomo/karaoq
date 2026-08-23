import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  useSearchBackNotice,
  NOTICE_MS,
} from "../../app/queue/useSearchBackNotice";
import { Room } from "../../pages/api/types";

const STORAGE_KEY = "karaoq_search_quota_out";

function roomSnapshot(searchResetsAt?: string): Room {
  return {
    id: "ROOM1",
    queue: [],
    activeVideoIndex: 0,
    isPlaying: false,
    ...(searchResetsAt ? { searchResetsAt } : {}),
  } as Room;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T05:00:00Z")); // 22:00 Pacific
});

afterEach(() => {
  vi.useRealTimers();
});

const RESETS_AT = "2026-08-23T07:00:00.000Z"; // tonight's midnight Pacific

describe("useSearchBackNotice", () => {
  it("stays quiet in a room that never lost search", () => {
    const { result } = renderHook(() => useSearchBackNotice());

    act(() => {
      result.current.applyRoom(roomSnapshot());
      result.current.applyRoom(roomSnapshot());
    });

    expect(result.current.show).toBe(false);
  });

  it("fires once on the poll where the quota-out flag clears", () => {
    const { result } = renderHook(() => useSearchBackNotice());

    act(() => {
      result.current.applyRoom(roomSnapshot(RESETS_AT));
    });
    expect(result.current.show).toBe(false); // still out — nothing to celebrate

    act(() => {
      result.current.applyRoom(roomSnapshot());
    });
    expect(result.current.show).toBe(true);

    act(() => {
      result.current.dismiss();
      result.current.applyRoom(roomSnapshot());
    });
    expect(result.current.show).toBe(false); // once, not on every clean poll
  });

  it("remembers the reset time so a reloaded page can still announce it", () => {
    const { result } = renderHook(() => useSearchBackNotice());

    act(() => {
      result.current.applyRoom(roomSnapshot(RESETS_AT));
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe(RESETS_AT);
  });

  it("announces to a device coming back after the reset, once a snapshot confirms it", () => {
    localStorage.setItem(STORAGE_KEY, RESETS_AT);
    vi.setSystemTime(new Date("2026-08-23T18:00:00Z")); // next morning

    const { result } = renderHook(() => useSearchBackNotice());
    expect(result.current.show).toBe(false); // armed, but waits for the room's word

    act(() => {
      result.current.applyRoom(roomSnapshot());
    });
    expect(result.current.show).toBe(true);
    // Cleared, so the singer isn't congratulated again on every later visit.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("stays quiet when the stored reset passed but quota is out again today", () => {
    localStorage.setItem(STORAGE_KEY, RESETS_AT);
    vi.setSystemTime(new Date("2026-08-24T04:00:00Z")); // next evening, 21:00 Pacific
    const NEXT_RESET = "2026-08-24T07:00:00.000Z";

    const { result } = renderHook(() => useSearchBackNotice());

    act(() => {
      result.current.applyRoom(roomSnapshot(NEXT_RESET));
    });

    expect(result.current.show).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(NEXT_RESET);

    // ...and the new outage announces normally when it clears.
    act(() => {
      result.current.applyRoom(roomSnapshot());
    });
    expect(result.current.show).toBe(true);
  });

  it("pulls a showing notice if quota trips again mid-linger", () => {
    const { result } = renderHook(() => useSearchBackNotice());

    act(() => {
      result.current.applyRoom(roomSnapshot(RESETS_AT));
      result.current.applyRoom(roomSnapshot());
    });
    expect(result.current.show).toBe(true);

    act(() => {
      result.current.applyRoom(roomSnapshot("2026-08-24T07:00:00.000Z"));
    });
    expect(result.current.show).toBe(false);
  });

  it("does not fire on mount while quota is still out", () => {
    localStorage.setItem(STORAGE_KEY, RESETS_AT); // reset is 2h in the future

    const { result } = renderHook(() => useSearchBackNotice());

    expect(result.current.show).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(RESETS_AT);
  });

  it("hides itself after the linger timeout", () => {
    const { result } = renderHook(() => useSearchBackNotice());

    act(() => {
      result.current.applyRoom(roomSnapshot(RESETS_AT));
      result.current.applyRoom(roomSnapshot());
    });
    expect(result.current.show).toBe(true);

    act(() => {
      vi.advanceTimersByTime(NOTICE_MS);
    });
    expect(result.current.show).toBe(false);
  });
});
