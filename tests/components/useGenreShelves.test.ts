import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useGenreShelves } from "../../components/songsearch/hooks/useGenreShelves";

const anime = { slug: "anime", name: "Anime", emoji: "⚔️", country: "JP", store: "JP", songs: [] };

function respond(genres: unknown[] | null) {
  return genres === null
    ? { ok: false, json: async () => ({}) }
    : { ok: true, json: async () => ({ genres }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGenreShelves", () => {
  it("loads a charted place's genres once, and nothing for an uncharted one", async () => {
    const fetchMock = vi.fn(async () => respond([anime]));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ place }) => useGenreShelves(place), {
      initialProps: { place: "JP" },
    });

    await waitFor(() => expect(result.current.genres).toEqual([anime]));
    rerender({ place: "ZZ" });
    expect(result.current.genres).toEqual([]);
    rerender({ place: "JP" });
    expect(result.current.genres).toEqual([anime]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("closes the open genre when the place changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond([anime])));
    const { result, rerender } = renderHook(({ place }) => useGenreShelves(place), {
      initialProps: { place: "JP" },
    });
    await waitFor(() => expect(result.current.genres).toHaveLength(1));

    act(() => result.current.open("anime"));
    expect(result.current.openGenre?.slug).toBe("anime");
    rerender({ place: "US" });
    rerender({ place: "JP" });
    expect(result.current.openGenre).toBeNull();
  });

  it("tries a failed place again the next time it's picked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(null))
      .mockResolvedValue(respond([anime]));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ place }) => useGenreShelves(place), {
      initialProps: { place: "JP" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.genres).toEqual([]);

    rerender({ place: "US" });
    rerender({ place: "JP" });
    await waitFor(() => expect(result.current.genres).toEqual([anime]));
  });
});
