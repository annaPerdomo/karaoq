import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVideoSync } from "../../components/musicvideo/hooks/useVideoSync";
import { resetClockSkew } from "../../lib/clockSkew";
import { SEEK_COOLDOWN_MS } from "../../lib/musicVideoSync";

function makeVideoRef() {
  const postMessage = vi.fn();
  const ref = { current: { contentWindow: { postMessage } } } as any;
  return { ref, postMessage };
}

function commands(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map(([data]) => JSON.parse(data as string));
}

function seeks(postMessage: ReturnType<typeof vi.fn>) {
  return commands(postMessage).filter((c) => c.func === "seekTo");
}

describe("useVideoSync", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetClockSkew();
  });

  it("seeks on mount, then holds off for the cooldown even while still drifted", () => {
    vi.useFakeTimers();
    const { ref, postMessage } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 20_000).toISOString();

    renderHook(() =>
      useVideoSync({
        roomId: "ROOM1",
        entryId: "e1",
        videoRef: ref,
        isPlaying: true,
        displayPaused: false,
        playStartedAt,
        playPausedAt: null,
        offsetS: 0,
      })
    );

    expect(seeks(postMessage)).toHaveLength(1);
    postMessage.mockClear();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seeks(postMessage)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(SEEK_COOLDOWN_MS);
    });
    expect(seeks(postMessage).length).toBeGreaterThan(0);
  });

  it("never seeks while the player reports buffering (state 3)", () => {
    vi.useFakeTimers();
    const { ref, postMessage } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 20_000).toISOString();

    const { result } = renderHook(() =>
      useVideoSync({
        roomId: "ROOM1",
        entryId: "e1",
        videoRef: ref,
        isPlaying: true,
        displayPaused: false,
        playStartedAt,
        playPausedAt: null,
        offsetS: 0,
      })
    );

    act(() => {
      result.current.onInfo(null, 3, null);
    });
    postMessage.mockClear();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(seeks(postMessage)).toHaveLength(0);
  });

  it("latches ended once the target passes the known duration, without waiting on the player", () => {
    vi.useFakeTimers();
    const { ref } = makeVideoRef();
    // Karaoke started 305s ago: the sync target is already past a 300s original.
    const playStartedAt = new Date(Date.now() - 305_000).toISOString();

    const { result } = renderHook(() =>
      useVideoSync({
        roomId: "ROOM1",
        entryId: "e1",
        videoRef: ref,
        isPlaying: true,
        displayPaused: false,
        playStartedAt,
        playPausedAt: null,
        offsetS: 0,
      })
    );

    expect(result.current.ended).toBe(false);

    act(() => {
      result.current.onInfo(299, 1, 300);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.ended).toBe(true);
  });

  it("neither seeks nor plays a player that has run past its end", () => {
    vi.useFakeTimers();
    const { ref, postMessage } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 305_000).toISOString();

    const { result } = renderHook(() =>
      useVideoSync({
        roomId: "ROOM1",
        entryId: "e1",
        videoRef: ref,
        isPlaying: true,
        displayPaused: false,
        playStartedAt,
        playPausedAt: null,
        offsetS: 0,
      })
    );
    act(() => {
      result.current.onInfo(300, 0, 300);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.ended).toBe(true);
    postMessage.mockClear();

    act(() => {
      vi.advanceTimersByTime(SEEK_COOLDOWN_MS * 3);
    });
    expect(commands(postMessage)).toHaveLength(0);
  });

  it("un-ends and resumes syncing when the host scrubs the target back before the end", () => {
    vi.useFakeTimers();
    const { ref, postMessage } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 305_000).toISOString();
    const props = {
      roomId: "ROOM1",
      entryId: "e1",
      videoRef: ref,
      isPlaying: true,
      displayPaused: false,
      playStartedAt,
      playPausedAt: null,
      offsetS: 0,
    };
    const { result, rerender } = renderHook((p) => useVideoSync(p), { initialProps: props });
    act(() => {
      result.current.onInfo(300, 0, 300);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.ended).toBe(true);
    postMessage.mockClear();

    rerender({ ...props, offsetS: -60 });
    act(() => {
      vi.advanceTimersByTime(SEEK_COOLDOWN_MS + 1000);
    });
    expect(result.current.ended).toBe(false);
    expect(seeks(postMessage).length).toBeGreaterThan(0);
  });

  it("does not latch ended while the target is short of the duration, even on state 0", () => {
    vi.useFakeTimers();
    const { ref } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 10_000).toISOString();

    const { result } = renderHook(() =>
      useVideoSync({
        roomId: "ROOM1",
        entryId: "e1",
        videoRef: ref,
        isPlaying: true,
        displayPaused: false,
        playStartedAt,
        playPausedAt: null,
        offsetS: 0,
      })
    );

    act(() => {
      result.current.onInfo(10, 0, 300);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.ended).toBe(false);
  });

  it("clears ended on a new entry", () => {
    vi.useFakeTimers();
    const { ref } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 305_000).toISOString();

    const { result, rerender } = renderHook(
      ({ entryId }: { entryId: string }) =>
        useVideoSync({
          roomId: "ROOM1",
          entryId,
          videoRef: ref,
          isPlaying: true,
          displayPaused: false,
          playStartedAt,
          playPausedAt: null,
          offsetS: 0,
        }),
      { initialProps: { entryId: "e1" } }
    );

    act(() => {
      result.current.onInfo(300, 0, 300);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.ended).toBe(true);

    rerender({ entryId: "e2" });
    expect(result.current.ended).toBe(false);
  });

  it("doesn't answer a seek's transient pause with playVideo (YouTube's glyph)", () => {
    vi.useFakeTimers();
    const { ref, postMessage } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 20_000).toISOString();
    const props = {
      roomId: "ROOM1",
      entryId: "e1",
      videoRef: ref,
      isPlaying: true,
      displayPaused: false,
      playStartedAt,
      playPausedAt: null,
      offsetS: 0,
    };
    const { result, rerender } = renderHook((p) => useVideoSync(p), { initialProps: props });
    act(() => result.current.onInfo(20, 1, 200));
    act(() => {
      vi.advanceTimersByTime(SEEK_COOLDOWN_MS + 1000);
    });

    postMessage.mockClear();
    rerender({ ...props, offsetS: 30 });
    for (let i = 0; i < 10 && seeks(postMessage).length === 0; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(seeks(postMessage).length).toBeGreaterThan(0);
    postMessage.mockClear();
    act(() => result.current.onInfo(null, 2, null));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(commands(postMessage).some((c) => c.func === "playVideo")).toBe(false);

    act(() => {
      vi.advanceTimersByTime(SEEK_COOLDOWN_MS);
    });
    expect(commands(postMessage).some((c) => c.func === "playVideo")).toBe(true);
  });

  it("still pauses at once when the karaoke pauses mid-seek", () => {
    vi.useFakeTimers();
    const { ref, postMessage } = makeVideoRef();
    const playStartedAt = new Date(Date.now() - 20_000).toISOString();
    const props = {
      roomId: "ROOM1",
      entryId: "e1",
      videoRef: ref,
      isPlaying: true,
      displayPaused: false,
      playStartedAt,
      playPausedAt: null,
      offsetS: 0,
    };
    const { result, rerender } = renderHook((p) => useVideoSync(p), { initialProps: props });
    act(() => result.current.onInfo(20, 1, 200));
    postMessage.mockClear();
    rerender({ ...props, displayPaused: true });
    expect(commands(postMessage).some((c) => c.func === "pauseVideo")).toBe(true);
  });
});
