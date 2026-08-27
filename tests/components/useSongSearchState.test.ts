import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockSearchYoutube = vi.fn();
const mockLookupVideo = vi.fn();
const mockSuggestionCuts = vi.fn();

vi.mock("../../app/queue/searchYoutube", async (importOriginal) => ({
  // SearchUnavailableError is used with `instanceof`, so the real module has to
  // stay behind the mocked default export.
  ...(await importOriginal<object>()),
  default: (...args: unknown[]) => mockSearchYoutube(...args),
}));

vi.mock("../../app/queue/lookupVideo", () => ({
  default: (...args: unknown[]) => mockLookupVideo(...args),
}));

vi.mock("../../app/queue/suggestionCuts", () => ({
  default: (...args: unknown[]) => mockSuggestionCuts(...args),
}));

import { useSongSearchState } from "../../components/songsearch/hooks/useSongSearchState";
import { SearchUnavailableError } from "../../app/queue/searchYoutube";
import { buildSearchQuery, searchCacheKey } from "../../lib/searchQuery";

const PASTE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function song(id: string) {
  return { videoId: id, title: `Song ${id}`, thumbnail: "", channelTitle: "" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup() {
  return renderHook(() => useSongSearchState({ roomId: "ROOM1", role: "singer" }));
}

async function runQuery(
  result: { current: ReturnType<typeof useSongSearchState> },
  text: string
) {
  await act(async () => {
    result.current.setQuery(text);
  });
  await act(async () => {
    result.current.search();
  });
}

describe("useSongSearchState — resultsVia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
  });

  it("marks typed-search results as search", async () => {
    mockSearchYoutube.mockResolvedValue([song("a"), song("b")]);
    const { result } = setup();

    await runQuery(result, "never gonna give you up");

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.resultsVia).toBe("search");
  });

  it("marks a pasted link's result as paste", async () => {
    mockLookupVideo.mockResolvedValue(song("dQw4w9WgXcQ"));
    const { result } = setup();

    await runQuery(result, PASTE_URL);

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.resultsVia).toBe("paste");
  });

  it("keeps search on results still on screen while a lookup is in flight", async () => {
    mockSearchYoutube.mockResolvedValue([song("a")]);
    const pending = deferred<ReturnType<typeof song>>();
    mockLookupVideo.mockReturnValue(pending.promise);
    const { result } = setup();

    await runQuery(result, "never gonna give you up");
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    await runQuery(result, PASTE_URL);

    expect(result.current.lookupMode).toBe(true);
    expect(result.current.results[0].videoId).toBe("a");
    expect(result.current.resultsVia).toBe("search");

    await act(async () => {
      pending.resolve(song("dQw4w9WgXcQ"));
    });
    expect(result.current.resultsVia).toBe("paste");
  });

  it("keeps paste on a pasted result after the query is edited", async () => {
    mockLookupVideo.mockResolvedValue(song("dQw4w9WgXcQ"));
    const { result } = setup();

    await runQuery(result, PASTE_URL);
    await waitFor(() => expect(result.current.resultsVia).toBe("paste"));

    await act(async () => {
      result.current.setQuery(`${PASTE_URL} karaoke`);
    });

    expect(result.current.lookupMode).toBe(false);
    expect(result.current.results).toHaveLength(1);
    expect(result.current.resultsVia).toBe("paste");
  });

  it("marks a bare-id lookup that falls through to search as search", async () => {
    mockLookupVideo.mockRejectedValue(
      new SearchUnavailableError(404, { reason: "not_found" })
    );
    mockSearchYoutube.mockResolvedValue([song("a"), song("b")]);
    const { result } = setup();

    await runQuery(result, "elevenchars");

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.resultsVia).toBe("search");
  });
});

describe("useSongSearchState — spending searches sparingly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    mockSearchYoutube.mockResolvedValue([song("a")]);
  });

  it("settles on one search when a singer tries several filter chips", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("abba waterloo");
    });
    await act(async () => {
      result.current.search();
    });
    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));

    // Fake timers only from here: waitFor above needs real ones to settle.
    vi.useFakeTimers();
    try {
      act(() => {
        result.current.updateFilter("duration", "short");
        result.current.updateFilter("duration", "medium");
        result.current.updateFilter("duration", "long");
      });
      expect(mockSearchYoutube).toHaveBeenCalledTimes(1);
      expect(result.current.searching).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(mockSearchYoutube).toHaveBeenCalledTimes(2);
      expect(mockSearchYoutube.mock.calls[1][1]).toMatchObject({ duration: "long" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a tap on the chip that's already active", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("abba waterloo");
    });
    await act(async () => {
      result.current.search();
    });
    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.updateFilter("duration", "any");
    });

    expect(mockSearchYoutube).toHaveBeenCalledTimes(1);
  });

  it("doesn't re-search when the karaoke toggle can't change the query", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("karaoke queen");
    });
    await act(async () => {
      result.current.search();
    });
    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.toggleKaraokeMode();
    });

    expect(mockSearchYoutube).toHaveBeenCalledTimes(1);
    expect(result.current.karaokeMode).toBe(false);
  });

  it("does re-search when the toggle genuinely changes the query", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("abba waterloo");
    });
    await act(async () => {
      result.current.search();
    });
    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));
    expect(mockSearchYoutube.mock.calls[0][0]).toBe("abba waterloo karaoke");

    await act(async () => {
      result.current.toggleKaraokeMode();
    });

    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(2));
    expect(mockSearchYoutube.mock.calls[1][0]).toBe("abba waterloo");
  });
});

describe("useSongSearchState — suggestion attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    mockSearchYoutube.mockResolvedValue([song("a")]);
    mockSuggestionCuts.mockRejectedValue(new SearchUnavailableError(404));
  });

  it("keys a suggestion tap the way the server keys its catalog", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.setQuery("ABBA Dancing Queen");
    });
    await act(async () => {
      result.current.runSearch("ABBA Dancing Queen", result.current.filters, true, true);
    });
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    expect(result.current.resultsSuggestionKey).toBe(
      searchCacheKey(buildSearchQuery("ABBA Dancing Queen", true))
    );
  });

  it("leaves a typed search unattributed", async () => {
    const { result } = setup();

    await runQuery(result, "my mate dave singing badly");

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.resultsSuggestionKey).toBeNull();
  });

  it("drops the attribution when a typed search replaces the suggestion", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("ABBA Dancing Queen");
    });
    await act(async () => {
      result.current.runSearch("ABBA Dancing Queen", result.current.filters, true, true);
    });
    await waitFor(() => expect(result.current.resultsSuggestionKey).not.toBeNull());

    // Otherwise the next add credits its video to a song nobody tapped, pinning
    // it to the wrong suggestion for everyone.
    await runQuery(result, "something else entirely");

    await waitFor(() => expect(result.current.resultsSuggestionKey).toBeNull());
  });

  it("drops the attribution when a pasted link replaces the suggestion", async () => {
    mockLookupVideo.mockResolvedValue(song("dQw4w9WgXcQ"));
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("ABBA Dancing Queen");
    });
    await act(async () => {
      result.current.runSearch("ABBA Dancing Queen", result.current.filters, true, true);
    });
    await waitFor(() => expect(result.current.resultsSuggestionKey).not.toBeNull());

    await runQuery(result, PASTE_URL);

    await waitFor(() => expect(result.current.resultsVia).toBe("paste"));
    expect(result.current.resultsSuggestionKey).toBeNull();
  });
});

describe("useSongSearchState — serving taps from the corpus", () => {
  const TAP = "ABBA Dancing Queen";
  const TAP_KEY = searchCacheKey(buildSearchQuery(TAP, true));

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    mockSearchYoutube.mockResolvedValue([song("live")]);
  });

  /** searchSuggestion fills the box before running, and the empty-query guard
   *  effect would otherwise wipe the results straight back out. */
  async function tap(result: { current: ReturnType<typeof useSongSearchState> }) {
    await act(async () => {
      result.current.setQuery(TAP);
    });
    await act(async () => {
      result.current.runSearch(TAP, result.current.filters, true, true);
    });
  }

  it("renders a resolved song's cuts without spending a search", async () => {
    mockSuggestionCuts.mockResolvedValue([song("cut1"), song("cut2")]);
    const { result } = setup();

    await tap(result);

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(mockSuggestionCuts).toHaveBeenCalledWith(TAP_KEY, expect.anything());
    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(result.current.resultsVia).toBe("search");
    expect(result.current.resultsSuggestionKey).toBe(TAP_KEY);
    expect(result.current.resultsFromCorpus).toBe(true);
    expect(result.current.searchError).toBeNull();
    expect(result.current.searching).toBe(false);
  });

  it("serves a tap from the corpus even with karaoke mode off", async () => {
    mockSuggestionCuts.mockResolvedValue([song("cut1")]);
    const { result } = setup();

    await act(async () => {
      result.current.setQuery(TAP);
    });
    await act(async () => {
      result.current.runSearch(TAP, result.current.filters, false, true);
    });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(mockSuggestionCuts).toHaveBeenCalledWith(TAP_KEY, expect.anything());
    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(result.current.resultsSuggestionKey).toBe(TAP_KEY);
  });

  it("falls through to a search for a song we hold nothing for", async () => {
    mockSuggestionCuts.mockRejectedValue(new SearchUnavailableError(404));
    const { result } = setup();

    await tap(result);

    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));
    expect(result.current.results[0].videoId).toBe("live");
    expect(result.current.resultsSuggestionKey).toBe(TAP_KEY);
    expect(result.current.resultsFromCorpus).toBe(false);
    expect(result.current.searchError).toBeNull();
  });

  it("falls through when the store request never lands", async () => {
    mockSuggestionCuts.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = setup();

    await tap(result);

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(mockSearchYoutube).toHaveBeenCalledTimes(1);
    expect(result.current.searchError).toBeNull();
  });

  it("searches when the tap carries a filter the cuts can't honour", async () => {
    mockSuggestionCuts.mockResolvedValue([song("cut1")]);
    const { result } = setup();

    await act(async () => {
      result.current.setQuery(TAP);
    });
    await act(async () => {
      result.current.runSearch(TAP, { duration: "short", sortBy: "relevance" }, true, true);
    });

    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));
    expect(mockSuggestionCuts).not.toHaveBeenCalled();
    expect(result.current.resultsSuggestionKey).toBe(TAP_KEY);
    // Null, not false: never asked, so it can't be recorded as having failed —
    // the dashboard would read that as a gap in the corpus.
    expect(result.current.resultsFromCorpus).toBeNull();
  });

  it("leaves a typed search on the search path", async () => {
    const { result } = setup();

    await runQuery(result, "my mate dave singing badly");

    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));
    expect(mockSuggestionCuts).not.toHaveBeenCalled();
    expect(result.current.resultsFromCorpus).toBeNull();
  });

  it("doesn't strand the spinner or buy a search when a tap is aborted", async () => {
    // What an aborted fetch actually rejects with, so the fall-through sees it.
    mockSuggestionCuts.mockImplementationOnce(
      (_key: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );
    const { result } = setup();

    await tap(result);
    expect(result.current.searching).toBe(true);

    await runQuery(result, "something else entirely");

    await waitFor(() => expect(result.current.results[0].videoId).toBe("live"));
    expect(mockSearchYoutube).toHaveBeenCalledTimes(1);
    expect(result.current.searching).toBe(false);
    expect(result.current.searchError).toBeNull();
  });
});

describe("useSongSearchState — pasting a link off the clipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    mockSearchYoutube.mockResolvedValue([song("a")]);
    mockLookupVideo.mockResolvedValue(song("dQw4w9WgXcQ"));
  });

  it("looks up a copied YouTube link and shows it in the box", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.pasteLink(PASTE_URL);
    });

    await waitFor(() => expect(mockLookupVideo).toHaveBeenCalled());
    expect(mockLookupVideo.mock.calls[0][0]).toBe("dQw4w9WgXcQ");
    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(result.current.query).toBe(PASTE_URL);
  });

  it("stays in lookup mode even though the paste wrote the box", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.pasteLink(PASTE_URL);
    });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.lookupMode).toBe(true);
  });

  it("leaves no control able to re-search the pasted URL", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.pasteLink(PASTE_URL);
    });
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    await act(async () => {
      result.current.updateFilter("duration", "short");
    });
    await act(async () => {
      result.current.toggleKaraokeMode();
    });

    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(result.current.resultsVia).toBe("paste");
  });

  it("takes a bare video id, which is what a copied share link often is", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.pasteLink("dQw4w9WgXcQ");
    });

    await waitFor(() => expect(mockLookupVideo).toHaveBeenCalled());
    expect(mockSearchYoutube).not.toHaveBeenCalled();
  });

  it("never falls through to a search when a copied id-shaped string misses", async () => {
    mockLookupVideo.mockRejectedValueOnce(new SearchUnavailableError(404));
    const { result } = setup();

    await act(async () => {
      result.current.pasteLink("Xk3jP9qLm2Z");
    });

    await waitFor(() => expect(result.current.searching).toBe(false));
    expect(mockSearchYoutube).not.toHaveBeenCalled();
  });

  it("still falls through for an id-shaped string the singer typed", async () => {
    mockLookupVideo.mockRejectedValueOnce(new SearchUnavailableError(404));
    const { result } = setup();

    await runQuery(result, "Xk3jP9qLm2Z");

    await waitFor(() => expect(mockSearchYoutube).toHaveBeenCalledTimes(1));
  });

  it("refuses clipboard text that isn't a link rather than spending a search", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("dido karaoke");
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = result.current.pasteLink(
        "a shopping list, or the last thing they copied"
      );
    });

    expect(accepted).toBe(false);
    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(mockLookupVideo).not.toHaveBeenCalled();
  });

  it("refuses without setting an error that would replace the panel", async () => {
    const { result } = setup();
    await runQuery(result, "dido");
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    await act(async () => {
      result.current.pasteLink("a shopping list");
    });

    expect(result.current.searchError).toBeNull();
    expect(result.current.results).toHaveLength(1);
  });

  it("refuses a non-YouTube URL the same way", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setQuery("dido karaoke");
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = result.current.pasteLink("https://example.com/song");
    });

    expect(accepted).toBe(false);
    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(result.current.searchError).toBeNull();
  });

  it("refuses a YouTube link that isn't one video", async () => {
    const { result } = setup();

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = result.current.pasteLink(
        "https://www.youtube.com/playlist?list=PL123"
      );
    });

    expect(accepted).toBe(false);
    expect(mockLookupVideo).not.toHaveBeenCalled();
    expect(result.current.searchError).toBeNull();
  });

  it("ignores an empty clipboard without touching the current results", async () => {
    const { result } = setup();

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = result.current.pasteLink("   ");
    });

    expect(accepted).toBe(false);
    expect(mockSearchYoutube).not.toHaveBeenCalled();
    expect(mockLookupVideo).not.toHaveBeenCalled();
  });
});

describe("useSongSearchState — the query a failure carries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    mockSearchYoutube.mockResolvedValue([song("a")]);
    mockLookupVideo.mockResolvedValue(song("dQw4w9WgXcQ"));
  });

  it("holds the query that ran, not what was typed after it", async () => {
    const { result } = setup();

    await runQuery(result, "abba");
    await waitFor(() => expect(result.current.searchedQuery).toBe("abba karaoke"));

    await act(async () => {
      result.current.setQuery("queen");
    });

    expect(result.current.searchedQuery).toBe("abba karaoke");
  });

  it("carries nothing when the box holds a pasted URL", async () => {
    const { result } = setup();

    await runQuery(result, "abba");
    await act(async () => {
      result.current.pasteLink(PASTE_URL);
    });

    await waitFor(() => expect(result.current.searchedQuery).toBe(""));
  });

  it("is cleared along with everything else on a reset", async () => {
    const { result } = setup();

    await runQuery(result, "abba");
    await waitFor(() => expect(result.current.searchedQuery).toBe("abba karaoke"));

    await act(async () => {
      result.current.clearSearch();
    });

    expect(result.current.searchedQuery).toBe("");
  });
});
