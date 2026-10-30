import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useOriginalVideo, RETRY_BUSY_MS } from "../../components/musicvideo/hooks/useOriginalVideo";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404) {
  return { ok, status, json: async () => body } as Response;
}

describe("useOriginalVideo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("resolves ok with the first candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "ok", videoIds: ["v1", "v2"] }))
    );
    const { result } = renderHook(() => useOriginalVideo("ROOM1", "entry-1", null));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.videoId).toBe("v1");
  });

  it("fail() moves to the next candidate, then to none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "ok", videoIds: ["v1", "v2"] }))
    );
    const { result } = renderHook(() => useOriginalVideo("ROOM1", "entry-1", null));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    act(() => result.current.fail());
    expect(result.current.videoId).toBe("v2");
    expect(result.current.status).toBe("ok");

    act(() => result.current.fail());
    expect(result.current.status).toBe("none");
    expect(result.current.videoId).toBeNull();
  });

  it("prefetches the next entry once the current one resolves ok", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: "ok", videoIds: ["v1"] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ entryId, nextEntryId }: { entryId: string | null; nextEntryId: string | null }) =>
        useOriginalVideo("ROOM1", entryId, nextEntryId),
      { initialProps: { entryId: "entry-1", nextEntryId: "entry-2" } }
    );

    await waitFor(() => expect(result.current.status).toBe("ok"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    rerender({ entryId: "entry-1", nextEntryId: "entry-2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a 404 as none, final, with no retry", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 404));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOriginalVideo("ROOM1", "entry-1", null));

    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(result.current.videoId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 429 as busy, retries once, then settles on none if still busy", async () => {
    // Fake timers from before mount: the retry setTimeout is scheduled inside
    // the first render's effect, so real timers can never observe it later.
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 429));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOriginalVideo("ROOM1", "entry-1", null));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("busy");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_BUSY_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("none");
  });

  it("treats a 5xx as busy and recovers to ok on the retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(jsonResponse({ status: "ok", videoIds: ["v1"] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOriginalVideo("ROOM1", "entry-1", null));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("busy");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_BUSY_MS);
    });

    expect(result.current.status).toBe("ok");
    expect(result.current.videoId).toBe("v1");
  });

  it("treats a network error as busy, not a final none", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOriginalVideo("ROOM1", "entry-1", null));

    await waitFor(() => expect(result.current.status).toBe("busy"));
  });
});
