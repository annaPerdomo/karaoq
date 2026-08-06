import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GlobalReach from "../../components/home/GlobalReach";
import { EMPTY_STATS, type PublicStats } from "../../lib/publicStats";

// The section only animates once it scrolls into view; report it visible
// immediately so assertions see final values rather than mid-count-up ones.
class MockIntersectionObserver {
  callback: (entries: { isIntersecting: boolean }[]) => void;
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = cb;
  }
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
}

beforeAll(() => {
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
  // Snap the count-up straight to its target.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
});

const FULL: PublicStats = {
  songs: 4200,
  cheers: 8900,
  countries: 31,
  countryCodes: ["US", "DE", "PH", "ID", "CZ", "SG"],
};

describe("GlobalReach", () => {
  it("renders the figures it was given", () => {
    render(<GlobalReach stats={FULL} />);
    expect(screen.getByText("4,200+")).toBeInTheDocument();
    expect(screen.getByText("8,900+")).toBeInTheDocument();
    // The country count is exact, not rounded, so it carries no "+".
    expect(screen.getByText("31")).toBeInTheDocument();
  });

  it("renders nothing at all when every figure is below its floor", () => {
    const { container } = render(<GlobalReach stats={EMPTY_STATS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a stat that cleared its floor even when its neighbours did not", () => {
    const { container } = render(
      <GlobalReach
        stats={{ songs: 2000, cheers: null, countries: null, countryCodes: [] }}
      />
    );
    expect(screen.getByText("2,000+")).toBeInTheDocument();
    // No country data means no map to draw.
    expect(container.querySelector("svg")).toBeNull();
  });

  it("labels the map with the country count for screen readers", () => {
    render(<GlobalReach stats={FULL} />);
    expect(
      screen.getByRole("img", { name: /31 countries lit up/i })
    ).toBeInTheDocument();
  });
});
