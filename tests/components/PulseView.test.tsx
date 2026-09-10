import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PulseView from "../../components/admin/pulse/PulseView";
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
    trend7d: {
      rooms: { current: 120, previous: 100 },
      songs: { current: 50, previous: 50 },
    },
    charts: {
      roomsByDay: [{ _id: '2026-09-04', count: 10 }],
      songsByDay: [{ _id: '2026-09-04', count: 40 }],
    },
    geo: { countries: [], cities: [] },
    rankings: { topSongs: [], topUsers: [] },
    devices: [],
    engagement: {
      songsPerRoomHistogram: [{ label: '1-5', count: 10 }],
      hosts: 20,
      repeatHosts: 5,
    },
    suggestions: {
      total: 0,
      bySource: [],
      bySection: [],
      byCategory: [],
      topSongs: [],
      byDay: [],
    },
    funnel: {
      windowDays: 30,
      roomsCreated: 100,
      roomsSearched: 80,
      roomsWithSong: 60,
      roomsEngaged: 20,
      medianMinutesToFirstSong: 3,
      p90MinutesToFirstSong: 10,
    },
    ...overrides,
  } as unknown as AnalyticsData;
}

describe("PulseView", () => {
  it("renders the momentum, activation, and rhythm headings", () => {
    render(<PulseView data={makeData()} />);
    expect(screen.getByText('Momentum · Last 7 days')).toBeTruthy();
    expect(screen.getByText('Activation · Last 30 days')).toBeTruthy();
    expect(screen.getByText('Rhythm · Last 30 days')).toBeTruthy();
  });

  it("shows the week-over-week trend when trend7d is present", () => {
    render(<PulseView data={makeData()} />);
    expect(screen.getByText('▲ 20% vs prior 7 days')).toBeTruthy();
    expect(screen.getByText('flat vs prior 7 days')).toBeTruthy();
  });

  it("still renders without trend7d, falling back to all-time songs", () => {
    const data = makeData();
    delete (data as { trend7d?: unknown }).trend7d;
    render(<PulseView data={data} />);
    expect(screen.getByText('Songs queued · All time')).toBeTruthy();
  });

  it("never says 'this week'", () => {
    render(<PulseView data={makeData()} />);
    expect(screen.queryByText(/this week/i)).toBeNull();
  });

  it("bans 'this month', 'weekly', and 'monthly' too", () => {
    render(<PulseView data={makeData()} />);
    expect(screen.queryByText(/this month/i)).toBeNull();
    expect(screen.queryByText(/weekly/i)).toBeNull();
    expect(screen.queryByText(/monthly/i)).toBeNull();
  });

  it("demotes secondary charts under disclosures", () => {
    render(<PulseView data={makeData()} />);
    expect(screen.getByText('More charts')).toBeTruthy();
    expect(screen.getByText('Feature adoption · All time')).toBeTruthy();
  });

  it("renders the all-time totals note", () => {
    render(<PulseView data={makeData()} />);
    expect(
      screen.getByText(/All time: 500 rooms · 3000 songs · 800 singers · 900 cheers/)
    ).toBeTruthy();
  });

  it("shows 'no prior data' when the prior 7-day window was zero", () => {
    const data = makeData({
      trend7d: {
        rooms: { current: 3, previous: 0 },
        songs: { current: 50, previous: 50 },
      },
    });
    render(<PulseView data={data} />);
    expect(screen.getByText('no prior data')).toBeTruthy();
  });

  it("shows a decline as ▼", () => {
    const data = makeData({
      trend7d: {
        rooms: { current: 80, previous: 100 },
        songs: { current: 50, previous: 50 },
      },
    });
    render(<PulseView data={data} />);
    expect(screen.getByText('▼ 20% vs prior 7 days')).toBeTruthy();
  });

  it("still sparks the Rooms tile off a sparse day series", () => {
    const data = makeData({
      charts: {
        roomsByDay: [
          { _id: '2026-09-04', count: 10 },
          { _id: '2026-09-09', count: 4 },
        ],
        songsByDay: [{ _id: '2026-09-04', count: 40 }],
      },
    });
    const { container } = render(<PulseView data={data} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('points')?.trim().split(' ').length).toBe(7);
  });
});
