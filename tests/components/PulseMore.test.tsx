import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PulseMore from "../../components/admin/pulse/PulseMore";
import type { AnalyticsData } from "../../components/admin/types";

function makeData(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    overview: {
      totalRooms: 500,
      roomsToday: 12,
      roomsLast7d: 120,
      totalSongs: 3000,
      totalReactions: 900,
      uniqueUsers: 800,
      avgSessionMinutes: 18,
      maxSessionMinutes: 90,
      medianSessionMinutes: 15,
      totalSessions: 1000,
      hostSessions: 500,
      singerSessions: 500,
      avgSongsPerRoom: 6,
      maxSongsPerRoom: 40,
      totalQrPrints: 50,
    },
    charts: {
      roomsByDay: [{ _id: '2026-09-04', count: 10 }],
      songsByDay: [{ _id: '2026-09-04', count: 40 }],
    },
    geo: { countries: [], cities: [] },
    rankings: {
      topSongs: [{ _id: { title: 'Song A', videoId: 'abc' }, count: 5 }],
      topUsers: [{ _id: 'user1', count: 3 }],
    },
    devices: [],
    engagement: {
      songsPerRoomHistogram: [{ label: '1-5', count: 10 }],
      hosts: 20,
      repeatHosts: 5,
    },
    ...overrides,
  } as unknown as AnalyticsData;
}

describe("PulseMore", () => {
  it("renders the 'More charts' summary", () => {
    render(<PulseMore data={makeData()} />);
    expect(screen.getByText('More charts')).toBeTruthy();
  });

  it("is closed by default", () => {
    const { container } = render(<PulseMore data={makeData()} />);
    expect(container.querySelector('details')?.open).toBe(false);
  });

  it("renders the songs-per-room histogram and top singers", () => {
    render(<PulseMore data={makeData()} />);
    expect(screen.getByText(/Songs per room · All time/)).toBeTruthy();
    expect(screen.getByText(/Top singers · All time/)).toBeTruthy();
  });
});
