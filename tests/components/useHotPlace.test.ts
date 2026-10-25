import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { placesFor, sectionFor, useHotPlace } from "../../components/songsearch/hooks/useHotPlace";
import { SONG_SECTIONS } from "../../app/queue/songSuggestions";

const jpChart = { id: "world", scope: "country", country: "JP", language: null, songs: [] };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ charts: [jpChart] }) }))
  );
});

describe("placesFor", () => {
  it("offers every chart and language-list country, plus the singer's own", () => {
    const places = placesFor("LK");
    expect(places).toEqual(expect.arrayContaining(["US", "JP", "KR", "IN", "LK"]));
    expect(places.filter((p) => p === "JP")).toHaveLength(1);
  });

  it("stands in a blank 'near you' place when the country is unknown", () => {
    expect(placesFor(null)).toContain("");
  });
});

describe("sectionFor", () => {
  it("finds the language list a place's classics come from", () => {
    expect(sectionFor("JP", SONG_SECTIONS)?.id).toBe("japanese");
    expect(sectionFor("GB", SONG_SECTIONS)).toBeNull();
  });
});

describe("useHotPlace", () => {
  it("opens at home and costs nothing until the singer looks elsewhere", () => {
    const onLeaveHome = vi.fn();
    const { result } = renderHook(() => useHotPlace("US", onLeaveHome));
    expect(result.current).toMatchObject({ place: "US", atHome: true, chart: null, loading: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(onLeaveHome).not.toHaveBeenCalled();
  });

  it("fetches every chart once, on the first pick elsewhere", async () => {
    const onLeaveHome = vi.fn();
    const { result } = renderHook(() => useHotPlace("US", onLeaveHome));

    act(() => result.current.pick("JP"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.chart?.country).toBe("JP"));
    expect(onLeaveHome).toHaveBeenCalled();

    act(() => result.current.pick("KR"));
    expect(result.current.chart).toBeNull();
    expect(result.current.loading).toBe(false);
    act(() => result.current.pick("US"));
    expect(result.current.atHome).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows the country once geo resolves, until the singer picks", () => {
    const { result, rerender } = renderHook(({ home }) => useHotPlace(home, () => {}), {
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
