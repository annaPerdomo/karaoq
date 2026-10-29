import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { usePlace } from "../../components/songsearch/hooks/usePlace";

const jpChart = { id: "world", scope: "country", country: "JP", language: null, songs: [] };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ charts: [jpChart] }) }))
  );
});

describe("usePlace", () => {
  it("opens at home and costs nothing until the singer looks elsewhere", () => {
    const { result } = renderHook(() => usePlace("US"));
    expect(result.current).toMatchObject({ place: "US", atHome: true, chart: null, chartLoading: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches every chart once, on the first pick elsewhere", async () => {
    const { result } = renderHook(() => usePlace("US"));

    act(() => result.current.pick("JP"));
    expect(result.current.chartLoading).toBe(true);
    await waitFor(() => expect(result.current.chart?.country).toBe("JP"));

    act(() => result.current.pick("KR"));
    expect(result.current.chart).toBeNull();
    expect(result.current.chartLoading).toBe(false);
    act(() => result.current.pick("US"));
    expect(result.current.atHome).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows the country once geo resolves, until the singer picks", () => {
    const { result, rerender } = renderHook(({ home }) => usePlace(home), {
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
