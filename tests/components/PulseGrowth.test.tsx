import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PulseGrowth from "../../components/admin/pulse/PulseGrowth";
import { bucketWeeks, fillDaysStacked } from "../../components/admin/chartData";
import type { AnalyticsData } from "../../components/admin/types";

function dayKey(daysAgo: number): string {
  const d = new Date(2026, 8, 13 - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeData(growth: AnalyticsData["growth"]): AnalyticsData {
  return { growth } as unknown as AnalyticsData;
}

afterEach(() => vi.useRealTimers());

describe("fillDaysStacked", () => {
  it("zero-fills omitted days and pads short segment lists", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 13, 12) });
    const out = fillDaysStacked(
      [{ _id: dayKey(0), rooms: 5, withSong: 3 }],
      3,
      2,
      (r) => [r.withSong, r.rooms - r.withSong]
    );
    expect(out.map((d) => d.segments)).toEqual([[0, 0], [0, 0], [3, 2]]);
    expect(out[2].label).toBe("Sep 13");
  });
});

describe("bucketWeeks", () => {
  it("sums seven-day buckets ending on the last day and drops a leading partial", () => {
    const daily = Array.from({ length: 16 }, (_, i) => ({
      label: `d${i}`,
      segments: [1, i],
    }));
    const weeks = bucketWeeks(daily);
    expect(weeks).toHaveLength(2);
    // Days 2..8 and 9..15: the first two days don't make a week.
    expect(weeks[0].segments).toEqual([7, 2 + 3 + 4 + 5 + 6 + 7 + 8]);
    expect(weeks[1].segments).toEqual([7, 9 + 10 + 11 + 12 + 13 + 14 + 15]);
    expect(weeks[1].title).toBe("d9 – d15");
  });
});

describe("PulseGrowth", () => {
  it("renders nothing on a deploy without the growth series", () => {
    const { container } = render(<PulseGrowth data={makeData(undefined)} />);
    expect(container.innerHTML).toBe("");
  });

  it("defaults to rooms over the last 30 days, split by activation", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 13, 12) });
    render(
      <PulseGrowth
        data={makeData({
          windowDays: 182,
          rooms: [{ _id: dayKey(0), rooms: 5, withSong: 3 }],
          songs: [],
        })}
      />
    );
    expect(screen.getByText("Growth · Last 30 days")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Rooms created per day" })).toBeTruthy();
    expect(screen.getByText("Queued a song")).toBeTruthy();
    expect(screen.getByText("No songs")).toBeTruthy();
  });

  it("switches to songs by source and to weekly buckets", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 13, 12) });
    render(
      <PulseGrowth
        data={makeData({
          windowDays: 182,
          rooms: [],
          songs: [
            { _id: dayKey(0), via: { search: 4, ideas: 2 } },
            { _id: dayKey(20), via: { paste: 1, mystery: 1 } },
          ],
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Songs queued" }));
    expect(screen.getByRole("img", { name: "Songs queued per day" })).toBeTruthy();
    const legend = screen.getAllByRole("listitem").map((li) => li.textContent);
    // Known vias in VIA_LABELS order, then unknown ones by name.
    expect(legend).toEqual(["Song ideas", "Search", "Pasted link", "mystery"]);

    fireEvent.click(screen.getByRole("button", { name: "Last 12 weeks" }));
    expect(screen.getByText("Growth · Last 12 weeks")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Songs queued per week" })).toBeTruthy();
  });
});
