import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SearchResults from "../../components/search/SearchResults";
import { SearchFailure } from "../../app/queue/searchYoutube";
import { en } from "../../lib/i18n/messages";

function renderFailure(searchError: SearchFailure) {
  render(
    <SearchResults
      hasSearched
      searching={false}
      searchError={searchError}
      results={[]}
      visibleCount={0}
      canAdd
      pickMode={false}
      onPreview={vi.fn()}
      onAdd={vi.fn()}
      onShowMore={vi.fn()}
    />
  );
}

describe("SearchResults quota state", () => {
  it("points a searcher at song ideas as well as pasting a link", () => {
    renderFailure({ quota: true, source: "search" });

    expect(screen.getByText(en["search.quotaIdeasHint"])).toBeInTheDocument();
    expect(screen.getByText(en["search.quotaPasteHint"])).toBeInTheDocument();
  });

  it("still offers song ideas when pasting a link is what hit the quota", () => {
    renderFailure({ quota: true, source: "lookup" });

    expect(screen.getByText(en["search.quotaIdeasHint"])).toBeInTheDocument();
    expect(
      screen.queryByText(en["search.quotaPasteHint"])
    ).not.toBeInTheDocument();
  });

  it("offers neither hint when search failed for some other reason", () => {
    renderFailure({ quota: false, source: "search" });

    expect(
      screen.queryByText(en["search.quotaIdeasHint"])
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(en["search.quotaPasteHint"])
    ).not.toBeInTheDocument();
  });
});
