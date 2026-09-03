import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PulseAudience from "../../components/admin/pulse/PulseAudience";
import type { AnalyticsData } from "../../components/admin/types";

function makeData(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    geo: { countries: [], cities: [] },
    devices: [
      { _id: "Mobile", count: 1022 },
      { _id: "Desktop", count: 767 },
      { _id: "TV", count: 16 },
    ],
    deviceDetail: {
      byRole: [
        {
          role: 'host',
          total: 891,
          devices: [
            { _id: 'Desktop', count: 560 },
            { _id: 'Mobile', count: 319 },
            { _id: 'TV', count: 12 },
          ],
          platforms: [
            { _id: 'Windows', count: 292 },
            { _id: 'Mac', count: 224 },
          ],
        },
        {
          role: 'singer',
          total: 709,
          devices: [
            { _id: 'Mobile', count: 643 },
            { _id: 'Desktop', count: 63 },
            { _id: 'TV', count: 3 },
          ],
          platforms: [{ _id: 'iPhone', count: 402 }],
        },
      ],
      byPlatform: [
        { _id: 'iPhone', count: 587 },
        { _id: 'LG TV', count: 10 },
      ],
    },
    tv: {
      byMonth: [
        { _id: '2026-07', rooms: 216, tvRooms: 3 },
        { _id: '2026-08', rooms: 376, tvRooms: 8 },
      ],
      sessions: 16,
      rooms: 14,
      byPlatform: [
        { _id: "LG", count: 10 },
        { _id: "Android TV", count: 3 },
        { _id: "Sony", count: 1 },
      ],
      byRole: [
        { _id: "host", count: 12 },
        { _id: "singer", count: 3 },
        { _id: "display", count: 1 },
      ],
    },
    ...overrides,
  } as unknown as AnalyticsData;
}

describe("PulseAudience devices", () => {
  it("breaks devices down by role", () => {
    render(<PulseAudience data={makeData()} />);
    expect(screen.getByText('Who is on what')).toBeTruthy();
    expect(screen.getByText('Hosting')).toBeTruthy();
    expect(screen.getByText('Joining')).toBeTruthy();
    expect(screen.getByText('891 sessions')).toBeTruthy();
  });

  it("shows each role's device mix as percentages", () => {
    render(<PulseAudience data={makeData()} />);
    // Hosts skew desktop (560/891); singers skew mobile (643/709).
    expect(screen.getByText(/Desktop 63%/)).toBeTruthy();
    expect(screen.getByText(/Mobile 91%/)).toBeTruthy();
  });

  // 3 of 709 rounds to zero, but the segment is visible, so "0%" beside it
  // reads as a bug rather than as a small number.
  it("renders a present-but-tiny share as <1%, not 0%", () => {
    render(<PulseAudience data={makeData()} />);
    expect(screen.getByText(/TV <1%/)).toBeTruthy();
  });

  it("lists every platform with TVs named by make", () => {
    render(<PulseAudience data={makeData()} />);
    expect(screen.getByText('Every platform seen')).toBeTruthy();
    expect(screen.getAllByText('LG TV').length).toBeGreaterThan(0);
  });

  // The blended one-liner is only for a payload that predates deviceDetail.
  it("falls back to the blended device line on an older payload", () => {
    const data = makeData();
    delete (data as { deviceDetail?: unknown }).deviceDetail;
    render(<PulseAudience data={data} />);
    expect(screen.getByText(/1% smart TV/)).toBeTruthy();
    expect(screen.queryByText('Who is on what')).toBeNull();
  });

  it("names the TV platforms and splits hosting from displaying", () => {
    render(<PulseAudience data={makeData()} />);
    expect(screen.getByText("Smart TVs")).toBeTruthy();
    expect(screen.getByText(/16 sessions across 14 rooms/)).toBeTruthy();
    expect(screen.getByText(/12 hosting the room, 1 only showing it/)).toBeTruthy();
    expect(screen.getByText("LG")).toBeTruthy();
    expect(screen.getByText("Android TV")).toBeTruthy();
  });

  it("charts TV-started rooms by month", () => {
    render(<PulseAudience data={makeData()} />);
    expect(screen.getByText(/Rooms started on a TV, by month/)).toBeTruthy();
    expect(screen.getByText('2026-08')).toBeTruthy();
  });

  // A deploy from before byMonth shipped sends tv without it; the month chart
  // must drop out rather than take the whole Audience tab down with it.
  it("hides just the month chart when an older payload omits byMonth", () => {
    const data = makeData();
    delete (data.tv as { byMonth?: unknown }).byMonth;
    render(<PulseAudience data={data} />);
    expect(screen.queryByText(/by month/)).toBeNull();
    expect(screen.getByText('Smart TVs')).toBeTruthy();
  });

  // A dashboard served by a deploy from before the TV split gets no tv object.
  it("hides the TV card rather than crashing when the field is absent", () => {
    render(<PulseAudience data={makeData({ tv: undefined })} />);
    expect(screen.queryByText("Smart TVs")).toBeNull();
    expect(screen.getByText("Who is on what")).toBeTruthy();
  });
});
