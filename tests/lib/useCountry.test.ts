import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useCountry from "../../app/queue/useCountry";

describe("useCountry", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("honors the ?country= URL override (uppercased), skipping fetch", async () => {
    window.history.replaceState({}, "", "/?country=br");
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useCountry());
    await waitFor(() => expect(result.current).toBe("BR"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores malformed overrides and falls back to /api/geo", async () => {
    window.history.replaceState({}, "", "/?country=brazil");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ country: "PH" }))
    );
    const { result } = renderHook(() => useCountry());
    await waitFor(() => expect(result.current).toBe("PH"));
  });

  it("uses a fresh localStorage cache without fetching", async () => {
    localStorage.setItem(
      "karaoq_country",
      JSON.stringify({ country: "DE", storedAt: Date.now() })
    );
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useCountry());
    await waitFor(() => expect(result.current).toBe("DE"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refetches when the cache is stale and stores the result", async () => {
    localStorage.setItem(
      "karaoq_country",
      JSON.stringify({ country: "DE", storedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    );
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ country: "JP" }))
    );
    const { result } = renderHook(() => useCountry());
    await waitFor(() => expect(result.current).toBe("JP"));
    expect(JSON.parse(localStorage.getItem("karaoq_country")!).country).toBe("JP");
  });

  it("stays null when geo is unknown (local dev)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ country: null }))
    );
    const { result } = renderHook(() => useCountry());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
