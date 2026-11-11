import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ hasCuts: false }));

vi.mock("../../app/queue/useCountry", () => ({ default: () => "US" }));

vi.mock("../../components/songsearch/hooks/useSongSearchState", () => ({
  useSongSearchState: () => {
    const video = { title: "Dancing Queen", thumbnailUrl: "", videoId: "refused0000" };
    const cuts = state.hasCuts ? [{ title: "Cut", thumbnailUrl: "", videoId: "cut10000000" }] : [];
    return {
      query: "",
      setQuery: vi.fn(),
      results: cuts,
      visibleCount: 10,
      setVisibleCount: vi.fn(),
      searching: false,
      hasSearched: true,
      searchError: state.hasCuts ? null : { quota: false, source: "lookup", link: "not_embeddable" },
      lookupMode: true,
      searchedQuery: "",
      resultsVia: "paste",
      resultsSuggestionKey: null,
      resultsFromCorpus: null,
      refused: { video, hasCuts: state.hasCuts },
      karaokeMode: true,
      filters: { duration: "any", sortBy: "relevance" },
      runSearch: vi.fn(),
      toggleKaraokeMode: vi.fn(),
      search: vi.fn(),
      pasteLink: vi.fn(),
      clearSearch: vi.fn(),
      resetSearch: vi.fn(),
      updateFilter: vi.fn(),
      trackFirstSearch: vi.fn(),
    };
  },
}));

vi.mock("../../components/songsearch/hooks/useDiscoveryBrowse", () => ({
  useDiscoveryBrowse: () => ({}),
}));

import SongSearch from "../../components/SongSearch";
import { en } from "../../lib/i18n/messages";

function renderSearch(props: { allowExternal?: boolean }) {
  render(<SongSearch roomId="ROOM1" userName="Anna" onSongAdded={vi.fn()} requireName={false} {...props} />);
}

describe.each([[true], [false]])("SongSearch with a refused paste (cuts: %s)", (hasCuts) => {
  it("offers no queue-anyway button unless allowExternal is set", () => {
    state.hasCuts = hasCuts;
    renderSearch({});
    expect(screen.getByText(/Dancing Queen/)).toBeInTheDocument();
    expect(screen.queryByText(en["search.refused.queueAnyway"])).toBeNull();
  });

  it("offers it when allowExternal is set", () => {
    state.hasCuts = hasCuts;
    renderSearch({ allowExternal: true });
    expect(screen.getByText(en["search.refused.queueAnyway"])).toBeInTheDocument();
  });
});
