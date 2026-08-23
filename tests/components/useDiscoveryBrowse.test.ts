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
      roomId: "ROOM1",
      t: (key: string) => key,
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

  it("sends a trending row straight to the search it always ran", async () => {
    // A trending row is a cleaned video title with no artist, so it keys to
    // nothing the catalog holds — asking is a guaranteed 404 on every tap.
    const { result } = setup();

    await act(async () => {
      result.current.searchSuggestion(
        { title: "Dancing Queen", artist: "" },
        undefined,
        "trending",
        "trending"
      );
    });

    await waitFor(() => expect(runSearch).toHaveBeenCalled());
    expect(askedTheCorpus()).toBe(false);
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
