import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockSearchYoutube = vi.fn();
const mockLookupVideo = vi.fn();

vi.mock("../../app/queue/searchYoutube", async (importOriginal) => ({
  // SearchUnavailableError is used with `instanceof`, so the real module has to
  // stay behind the mocked default export.
  ...(await importOriginal<object>()),
  default: (...args: unknown[]) => mockSearchYoutube(...args),
}));

vi.mock("../../app/queue/lookupVideo", () => ({
  default: (...args: unknown[]) => mockLookupVideo(...args),
}));

import { useSongSearchState } from "../../components/songsearch/hooks/useSongSearchState";

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
    const { SearchUnavailableError } = await import("../../app/queue/searchYoutube");
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
