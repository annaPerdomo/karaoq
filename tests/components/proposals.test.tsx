import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Proposals from "../../components/admin/suggestions/Proposals";
import type { ProposalRow, ProposalsData } from "../../components/admin/types";

function row(over: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "sig",
    label: "The Agadiers - Mag Dungan Ta",
    candidates: [
      { artist: "Mag Dungan Ta", title: "The Agadiers" },
      { artist: "The Agadiers", title: "Mag Dungan Ta" },
    ],
    picked: { artist: "Mag Dungan Ta", title: "The Agadiers" },
    rooms: 1,
    searchRooms: 0,
    countries: ["PH"],
    addCount: 3,
    searchCount: 0,
    videoIds: ["v1"],
    qualifies: false,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function payload(over: Partial<ProposalsData> = {}): ProposalsData {
  return {
    rows: [row()],
    thresholds: { minRooms: 3, minCountries: 2 },
    ...over,
  };
}

function stubFetch(data: ProposalsData) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => data }) as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Proposals", () => {
  it("reads the picked title and the auto-promote note", async () => {
    stubFetch(payload());
    render(<Proposals secret="s" />);

    expect(await screen.findByText("The Agadiers — Mag Dungan Ta")).toBeTruthy();
    expect(screen.getByText(/3\+ rooms or 2\+/)).toBeTruthy();
  });

  it("switches tabs and refetches with the new view", async () => {
    const fetchMock = stubFetch(payload());
    render(<Proposals secret="s" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Promoted" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain("view=promoted");
  });

  it("drops a row from the list once it's approved", async () => {
    stubFetch(payload());
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: async () => ({ result: "promoted" }) } as Response;
      return { ok: true, json: async () => payload() } as Response;
    }));
    render(<Proposals secret="s" />);

    const approve = await screen.findByRole("button", { name: "Approve" });
    fireEvent.click(approve);

    await waitFor(() =>
      expect(screen.queryByText("The Agadiers — Mag Dungan Ta")).toBeNull()
    );
  });

  it("offers a retry rather than an empty card when the read fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    render(<Proposals secret="s" />);

    expect(await screen.findByText(/Couldn.t read the proposals/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("flips the current reading on Swap, in place, no candidate lookup", async () => {
    stubFetch(payload());
    render(<Proposals secret="s" />);

    expect(await screen.findByText("The Agadiers — Mag Dungan Ta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    expect(await screen.findByText("Mag Dungan Ta — The Agadiers")).toBeTruthy();
  });

  it("keeps a duplicate row and shows where the song already lives, instead of removing it", async () => {
    stubFetch(payload());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return { ok: true, json: async () => ({ result: "duplicate", songId: "key123" }) } as Response;
        }
        return { ok: true, json: async () => payload() } as Response;
      })
    );
    render(<Proposals secret="s" />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByText(/Already in the corpus as key123/)).toBeTruthy();
    expect(screen.getByText("The Agadiers — Mag Dungan Ta")).toBeTruthy();
  });

  it("shows an in-row error rather than throwing when the approve request fails", async () => {
    stubFetch(payload());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return { ok: false } as Response;
        return { ok: true, json: async () => payload() } as Response;
      })
    );
    render(<Proposals secret="s" />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByText(/Couldn.t reach the server/)).toBeTruthy();
    expect(screen.getByText("The Agadiers — Mag Dungan Ta")).toBeTruthy();
  });
});
