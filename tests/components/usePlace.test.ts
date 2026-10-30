import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { usePlace } from "../../components/songsearch/hooks/usePlace";

const shelf = (id: string, scope: string, country: string | null) => ({
  id, scope, country, language: null, songs: [],
});

let failNext = false;
beforeEach(() => {
  failNext = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (failNext) {
        failNext = false;
        return { ok: false, json: async () => ({}) };
      }
      const cc = new URL(String(url), "http://x").searchParams.get("c");
      return {
        ok: true,
        json: async () => ({
          shelves: [shelf("hot", "country", cc), shelf("rooms", "world", null)],
        }),
      };
    })
  );
});

describe("usePlace", () => {
  it("opens at home and costs nothing until the singer looks elsewhere", () => {
    const { result } = renderHook(() => usePlace("US", "en"));
    expect(result.current).toMatchObject({ place: "US", atHome: true, placeShelves: null, placeLoading: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads a picked place's own lists once, dropping any that widened past it", async () => {
    const { result } = renderHook(() => usePlace("US", "en"));

    act(() => result.current.pick("JP"));
    expect(result.current.placeLoading).toBe(true);
    await waitFor(() => expect(result.current.placeLoading).toBe(false));
    // The world-scoped rooms list would read "Rooms in Japan" — so it's left out.
    expect(result.current.placeShelves!.map((s) => [s.id, s.country])).toEqual([["hot", "JP"]]);

    act(() => result.current.pick("US"));
    act(() => result.current.pick("JP"));
    expect(result.current.placeLoading).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch as any).mock.calls[0][0])).toBe("/api/suggestions/shelves?c=JP");
  });

  it("asks a place again after its request failed", async () => {
    const { result } = renderHook(() => usePlace("US", "en"));
    failNext = true;
    act(() => result.current.pick("KR"));
    await waitFor(() => expect(result.current.placeLoading).toBe(false));
    expect(result.current.placeShelves).toEqual([]);

    act(() => result.current.pick("US"));
    act(() => result.current.pick("KR"));
    await waitFor(() => expect(result.current.placeShelves!.length).toBe(1));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("follows the country once geo resolves, until the singer picks", () => {
    const { result, rerender } = renderHook(({ home }) => usePlace(home, "en"), {
      initialProps: { home: null as string | null },
    });
    expect(result.current.place).toBe("");
    rerender({ home: "MX" });
    expect(result.current.place).toBe("MX");
    act(() => result.current.pick("JP"));
    rerender({ home: "BR" });
    expect(result.current.place).toBe("JP");
  });
});
