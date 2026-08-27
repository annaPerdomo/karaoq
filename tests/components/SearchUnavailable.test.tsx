import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchUnavailable from "../../components/search/SearchUnavailable";
import { SearchFailure } from "../../app/queue/searchYoutube";
import { en } from "../../lib/i18n/messages";

function renderPanel(
  searchError: SearchFailure,
  { query = "dido karaoke", onPasteLink = vi.fn(() => true) } = {}
) {
  render(
    <SearchUnavailable
      searchError={searchError}
      searchedQuery={query}
      onPasteLink={onPasteLink}
    />
  );
  return { onPasteLink };
}

/** jsdom has no clipboard; `read` undefined stands in for a browser without it. */
function stubClipboard(read?: () => Promise<string>) {
  Object.defineProperty(navigator, "clipboard", {
    value: read ? { readText: read } : undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  stubClipboard(undefined);
});

describe("what still works when search doesn't", () => {
  it("points a searcher at song ideas as well as pasting a link", () => {
    renderPanel({ quota: true, source: "search" });

    expect(screen.getByText(en["search.quotaIdeasHint"])).toBeInTheDocument();
    expect(screen.getByText(en["search.pasteHint"])).toBeInTheDocument();
  });

  it("offers both hints when search failed for some other reason", () => {
    renderPanel({ quota: false, source: "search" });

    expect(screen.getByText(en["search.quotaIdeasHint"])).toBeInTheDocument();
    expect(screen.getByText(en["search.pasteHint"])).toBeInTheDocument();
  });

  it("never tells someone to paste when the paste is what failed", () => {
    renderPanel({ quota: true, source: "lookup" });

    expect(screen.getByText(en["search.quotaIdeasHint"])).toBeInTheDocument();
    expect(screen.queryByText(en["search.pasteHint"])).not.toBeInTheDocument();
  });

  it("closes with the search-limit reassurance on either ceiling", () => {
    renderPanel({ quota: false, busy: true, source: "search" });
    expect(screen.getByText(en["search.limitWorkHint"])).toBeInTheDocument();

    renderPanel({ quota: true, source: "lookup" });
    expect(screen.getAllByText(en["search.limitWorkHint"])).toHaveLength(2);
  });

  it("names no limit when the server never named one", () => {
    renderPanel({ quota: false, source: "search" });

    expect(screen.getByText(en["search.unavailable.genericTitle"])).toBeInTheDocument();
    expect(screen.getByText(en["search.unavailable.genericBody"])).toBeInTheDocument();
    expect(screen.queryByText(en["search.unavailable.body"])).not.toBeInTheDocument();
    expect(screen.queryByText(en["search.limitWorkHint"])).not.toBeInTheDocument();
  });

  it("says we hit the limit when the server said search was busy", () => {
    renderPanel({ quota: false, busy: true, source: "search" });

    expect(screen.getByText(en["search.unavailable.title"])).toBeInTheDocument();
    expect(screen.getByText(en["search.unavailable.body"])).toBeInTheDocument();
  });

  it("keeps the reassurance out of a bad-link message", () => {
    renderPanel({ quota: false, source: "lookup", link: "not_youtube" });

    expect(
      screen.queryByText(en["search.limitWorkHint"])
    ).not.toBeInTheDocument();
  });

  it("says nothing about pasting when the link itself was the problem", () => {
    renderPanel({ quota: false, source: "lookup", link: "not_found" });

    expect(screen.getByText(en["search.linkNotFound"])).toBeInTheDocument();
    expect(screen.queryByText(en["search.pasteHint"])).not.toBeInTheDocument();
  });
});

describe("the way out to YouTube", () => {
  it("carries the query they typed, so they land on their own song", () => {
    renderPanel({ quota: true, source: "search" });

    const link = screen.getByRole("link", { name: /dido karaoke/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/results?search_query=dido%20karaoke"
    );
  });

  it("opens in a new tab, so the room survives the trip", () => {
    renderPanel({ quota: true, source: "search" });

    const link = screen.getByRole("link", { name: /dido karaoke/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("offers no link when there is no typed query to carry", () => {
    renderPanel({ quota: true, source: "search" }, { query: "" });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(en["search.pasteHint"])).toBeInTheDocument();
  });
});

describe("getting the link back in", () => {
  it("hands a copied link straight to the caller", async () => {
    stubClipboard(async () => "https://youtu.be/dQw4w9WgXcQ");
    const { onPasteLink } = renderPanel({ quota: true, source: "search" });

    const button = await screen.findByRole("button", {
      name: en["search.pasteFromClipboard"],
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(onPasteLink).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ")
    );
  });

  it("never leaves a dead button when the clipboard is refused", async () => {
    stubClipboard(async () => {
      throw new Error("denied");
    });
    const { onPasteLink } = renderPanel({ quota: true, source: "search" });

    fireEvent.click(
      await screen.findByRole("button", { name: en["search.pasteFromClipboard"] })
    );

    expect(onPasteLink).not.toHaveBeenCalled();
    expect(
      await screen.findByText(en["search.pasteClipboardDenied"])
    ).toBeInTheDocument();
  });

  it("says so in place when the clipboard held something else", async () => {
    stubClipboard(async () => "milk, eggs, bread");
    renderPanel({ quota: true, source: "search" }, { onPasteLink: vi.fn(() => false) });

    fireEvent.click(
      await screen.findByRole("button", { name: en["search.pasteFromClipboard"] })
    );

    expect(await screen.findByText(en["search.pasteNotLink"])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dido karaoke/ })).toBeInTheDocument();
    expect(screen.getByText(en["search.quotaIdeasHint"])).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: en["search.pasteFromClipboard"] })
    ).toBeInTheDocument();
  });

  it("hides the button entirely where the browser has no clipboard read", () => {
    stubClipboard(undefined);
    renderPanel({ quota: true, source: "search" });

    expect(
      screen.queryByRole("button", { name: en["search.pasteFromClipboard"] })
    ).not.toBeInTheDocument();
  });
});
