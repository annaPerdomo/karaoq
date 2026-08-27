import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WantedSongs from "../../components/admin/suggestions/WantedSongs";
import type { WantedSongRow, WantedSongsData } from "../../components/admin/types";

function row(over: Partial<WantedSongRow> = {}): WantedSongRow {
  return {
    key: "the agadiers mag dungan ta karaoke",
    label: "The Agadiers Mag Dungan Ta karaoke",
    count: 12,
    countries: [
      { code: "PH", count: 8 },
      { code: "DE", count: 3 },
      { code: "TW", count: 1 },
    ],
    rooms: 5,
    spent: 2,
    unmet: 4,
    catalogued: false,
    hasCuts: false,
    lastSeenAt: "2026-08-26T04:00:00.000Z",
    ...over,
  };
}

function payload(over: Partial<WantedSongsData> = {}): WantedSongsData {
  return {
    totals: {
      queries: 3,
      searches: 100,
      served: 80,
      spent: 12,
      stale: 4,
      corpus: 0,
      error: 4,
    },
    rows: [row()],
    matched: 1,
    limit: 50,
    ...over,
  };
}

function stubFetch(data: WantedSongsData) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => data }) as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WantedSongs", () => {
  it("leads with the songs asked for in the most countries", async () => {
    stubFetch(payload());
    render(<WantedSongs secret="s" />);

    // The mode word the client appends is display noise, not part of the name.
    expect(await screen.findByText("The Agadiers Mag Dungan Ta")).toBeTruthy();
    expect(screen.getByText(/3 countries/)).toBeTruthy();
    // A lower bound, and it has to read as one.
    expect(screen.getByText(/5\+ rooms/)).toBeTruthy();
    expect(screen.getByText(/4 came back empty/)).toBeTruthy();
    expect(screen.getByText("NOT CATALOGUED")).toBeTruthy();
  });

  it("asks for the gaps first, because that is the list worth acting on", async () => {
    const fetchMock = stubFetch(payload());
    render(<WantedSongs secret="s" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("gaps=1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("rank=breadth");
  });

  it("separates a song we have from one the catalogue has never heard of", async () => {
    stubFetch(
      payload({
        rows: [
          row({ key: "a", label: "Held", catalogued: true, hasCuts: true }),
          row({ key: "b", label: "Buyable", catalogued: true, hasCuts: false }),
        ],
      })
    );
    render(<WantedSongs secret="s" />);

    expect(await screen.findByText("IN THE CORPUS")).toBeTruthy();
    // The one the resolver can fill tonight without anyone approving a pack.
    expect(screen.getByText("CATALOGUED, NO CUTS")).toBeTruthy();
  });

  it("says how much of the search load never reached YouTube", async () => {
    stubFetch(payload());
    render(<WantedSongs secret="s" />);

    // served + stale + corpus out of every search.
    expect(await screen.findByText(/84% of searches — cache and corpus/)).toBeTruthy();
  });

  it("reads an empty gap list as good news, not as no data", async () => {
    stubFetch(payload({ rows: [], matched: 0 }));
    render(<WantedSongs secret="s" />);

    expect(
      await screen.findByText(/Nothing asked for that the corpus cannot already answer/)
    ).toBeTruthy();
  });

  it("ignores a slow reply that a newer ranking has overtaken", async () => {
    const breadth = payload({ rows: [row({ key: "a", label: "By country" })] });
    const volume = payload({ rows: [row({ key: "b", label: "By volume" })] });
    // The first request answers last, which the rank toggles make easy.
    let settleFirst: (() => void) | null = null;
    const fetchMock = vi.fn(async (url: string) => {
      const data = String(url).indexOf("rank=volume") >= 0 ? volume : breadth;
      if (!settleFirst) {
        await new Promise<void>((resolve) => {
          settleFirst = resolve;
        });
      }
      return { ok: true, json: async () => data } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WantedSongs secret="s" />);
    await waitFor(() => expect(settleFirst).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Most searched" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    settleFirst!();

    expect(await screen.findByText("By volume")).toBeTruthy();
    expect(screen.queryByText("By country")).toBeNull();
  });

  it("offers a retry rather than an empty card when the read fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    render(<WantedSongs secret="s" />);

    expect(await screen.findByText(/Couldn.t read the demand ledger/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
