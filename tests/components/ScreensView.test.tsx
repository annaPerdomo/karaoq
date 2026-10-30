import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ScreensView from "../../components/admin/screens/ScreensView";
import type { ScreensStats } from "../../components/admin/screens/types";
import { STATUS } from "../../components/admin/charts/palette";

const MB = 1024 * 1024;

function makeStats(overrides: Partial<ScreensStats["brand"]> = {}, empty = false): ScreensStats {
  return {
    days: 30,
    musicVideo: {
      rooms: empty ? 0 : 10,
      opens: empty ? 0 : 14,
      repeatRooms: empty ? 0 : 4,
      medianMinutesOpen: empty ? null : 42,
      songsShown: empty ? 0 : 90,
      songsUnavailable: empty ? 0 : 10,
      resolve: { cache: empty ? 0 : 60, live: empty ? 0 : 30, quota: 0, busy: 0, none: empty ? 0 : 10 },
      errors: empty ? [] : [{ code: 150, count: 3 }, { code: 101, count: 2 }, { code: 100, count: 1 }],
      songsNudged: empty ? 0 : 9,
      medianAbsOffset: empty ? null : 1.5,
      links: { open: empty ? 0 : 5, copy: empty ? 0 : 2 },
      daily: Array.from({ length: 30 }, (_, i) => ({
        day: `2026-10-${String(i + 1).padStart(2, "0")}`,
        rooms: empty ? 0 : i % 3,
      })),
    },
    brand: {
      roomsWithLogo: empty ? 0 : 3,
      roomsWithColors: empty ? 0 : 5,
      saves: { host: empty ? 0 : 6, display: empty ? 0 : 2 },
      clears: 0,
      uploads: empty ? 0 : 4,
      rejected: { type: empty ? 0 : 1, size: empty ? 0 : 2, storage_full: 0 },
      storageBytes: 5 * MB,
      storageBudgetBytes: 25 * MB,
      committedLogos: 3,
      ...overrides,
    },
    feedback: empty
      ? []
      : [
          {
            id: "f1",
            createdAt: "2026-10-29T10:00:00.000Z",
            kind: "bug",
            message: "The video lags behind",
            page: "/display/ABCD/video",
          },
          {
            id: "f2",
            createdAt: "2026-10-28T10:00:00.000Z",
            kind: "idea",
            message: `${"a".repeat(200)}TAIL`,
          },
        ],
  };
}

function serve(stats: ScreensStats) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => stats }) as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function storageDot(): Element | null {
  const label = screen.getByText("Logo storage");
  return label.querySelector('span[aria-hidden="true"]');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScreensView", () => {
  it("renders the tiles from the stats", async () => {
    const fetchMock = serve(makeStats());
    render(<ScreensView secret="s" />);
    await screen.findByText("Rooms using it");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/screens?days=30",
      expect.objectContaining({ headers: { "x-analytics-secret": "s" } })
    );
    expect(screen.getByText("Came back")).toBeTruthy();
    expect(screen.getByText("40% of rooms, on 2+ days")).toBeTruthy();
    expect(screen.getByText("Videos found")).toBeTruthy();
    expect(screen.getByText("90%")).toBeTruthy();
    expect(screen.getByText("Needed a nudge")).toBeTruthy();
    expect(screen.getByText("10%")).toBeTruthy();
    expect(screen.getByText("Rooms with a logo")).toBeTruthy();
    expect(screen.getByText("Rooms with colours")).toBeTruthy();
    expect(screen.getByText("5.0 MB of 25.0 MB")).toBeTruthy();
    // 101 and 150 share one row: 3 + 2.
    expect(screen.getAllByText("Embedding blocked")).toHaveLength(1);
    expect(screen.getByTitle(/^Embedding blocked \(code 150, 101\) — 5$/)).toBeTruthy();
    expect(screen.getByText(`${"a".repeat(200)}…`)).toBeTruthy();
    expect(screen.queryByText(/TAIL/)).toBeNull();
    expect(screen.getByText("From cache")).toBeTruthy();
    expect(screen.getByText("The video lags behind")).toBeTruthy();
    expect(storageDot()).toBeNull();
  });

  it("switches the storage tile to warning at 80% of the budget", async () => {
    serve(makeStats({ storageBytes: 20 * MB }));
    render(<ScreensView secret="s" />);
    await screen.findByText("Logo storage");
    const dot = storageDot() as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot!.style.background).toBeTruthy();
    expect(screen.getByText(/^80% used/)).toBeTruthy();
    // jsdom normalises the hex to rgb.
    const probe = document.createElement("span");
    probe.style.background = STATUS.warning;
    expect(dot!.style.background).toBe(probe.style.background);
  });

  it("shows an empty state when there are no events", async () => {
    serve(makeStats({ storageBytes: 0, committedLogos: 0 }, true));
    render(<ScreensView secret="s" />);
    await waitFor(() =>
      expect(
        screen.getByText(/No music-video screen or branding activity in the last 30 days/)
      ).toBeTruthy()
    );
    expect(screen.queryByText("Rooms using it")).toBeNull();
  });

  it("keeps the storage warning when there are no events but storage is at 80%", async () => {
    serve(makeStats({ storageBytes: 20 * MB }, true));
    render(<ScreensView secret="s" />);
    await screen.findByText("Logo storage");
    expect(storageDot()).not.toBeNull();
  });
});
