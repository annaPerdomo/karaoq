import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../app/queue/regionalPack", () => ({
  default: vi.fn(async () => null),
}));

import { useDiscoveryBrowse } from "../../components/songsearch/hooks/useDiscoveryBrowse";
import { SONG_SECTIONS } from "../../app/queue/songSuggestions";
import type { SearchFilters } from "../../app/queue/searchYoutube";

const runSearch = vi.fn();
const setQuery = vi.fn();
const trackFirstSearch = vi.fn();

const FILTERS: SearchFilters = { duration: "any", sortBy: "relevance" };

function setup() {
  return renderHook(() =>
    useDiscoveryBrowse({
      country: null,
      locale: "en",
      roomId: "ROOM1",
      filters: FILTERS,
      karaokeMode: true,
      setQuery,
      runSearch,
      trackFirstSearch,
    })
  );
}

/** The fourth argument: whether the tap names a song the catalog holds cuts
 *  for, and so whether the client asks the corpus before searching. */
function askedTheCorpus(): boolean {
  return runSearch.mock.calls[0][3] === true;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) }))
  );
});

describe("useDiscoveryBrowse — which taps reach for the corpus", () => {
  const catalogued = SONG_SECTIONS[0].categories[0].songs[0];

  it("names the catalogued song a pick came from", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.searchSuggestion(catalogued, "pop", "cat");
    });

    await waitFor(() => expect(runSearch).toHaveBeenCalled());
    expect(askedTheCorpus()).toBe(true);
  });

  it("names the song behind a surprise pick, which comes off the catalog", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.handleSurpriseMe();
    });

    await waitFor(() => expect(runSearch).toHaveBeenCalled());
    expect(askedTheCorpus()).toBe(true);
  });
});

describe("useDiscoveryBrowse — idea shelves", () => {
  const shelf = {
    id: "hot" as const,
    scope: "country" as const,
    language: null,
    country: "US",
    songs: [
      {
        key: "tate mcrae housewife karaoke",
        title: "Housewife",
        artist: "Tate McRae",
        videoId: "v1",
        videoTitle: "Housewife (Karaoke)",
        thumbnailUrl: "https://i.ytimg.com/vi/v1/mq.jpg",
        rank: 1,
      },
    ],
  };

  function posted(url: string): any[] {
    return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u]) => String(u).indexOf(url) === 0)
      .map(([, init]) => (init?.body ? JSON.parse(init.body) : null));
  }

  it("loads the shelves for the singer's country", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ shelves: [shelf] }) }))
    );
    const { result } = renderHook(() =>
      useDiscoveryBrowse({
        country: "US",
        locale: "es",
        roomId: "ROOM1",
        filters: FILTERS,
        karaokeMode: true,
        setQuery,
        runSearch,
        trackFirstSearch,
      })
    );

    await waitFor(() => expect(result.current.shelves).toEqual([shelf]));
    const urls = (fetch as any).mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls).toContain("/api/suggestions/shelves?c=US");
    // Opens on the shelves until the singer picks a tab.
    expect(result.current.activeTab).toBe("hot");
  });

  it("records a shelf pick without running a search", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.trackShelfPick(shelf.songs[0], shelf);
    });

    expect(runSearch).not.toHaveBeenCalled();
    expect(trackFirstSearch).toHaveBeenCalled();
    expect(posted("/api/analytics/suggestion")).toEqual([
      {
        roomId: "ROOM1",
        suggestionSource: "shelf",
        ideaSurface: "hot",
        ideaAway: false,
        sectionId: "hot",
        categoryId: "US",
        songTitle: "Housewife",
        songArtist: "Tate McRae",
      },
    ]);
  });

  it("opens a shelf song's other versions from the corpus without a second tap event", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.showSongCuts(shelf.songs[0], shelf.songs[0].key);
    });

    await waitFor(() => expect(runSearch).toHaveBeenCalled());
    expect(setQuery).toHaveBeenCalledWith("Tate McRae Housewife");
    // The shelf's own key, not one re-derived from the displayed name.
    expect(runSearch.mock.calls[0][3]).toBe("tate mcrae housewife karaoke");
    expect(posted("/api/analytics/suggestion")).toEqual([]);
  });
});

