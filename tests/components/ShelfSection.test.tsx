import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ShelfSection from "../../components/songsearch/ShelfSection";

const song = { key: "k", title: "Song", artist: "Artist", rank: 1 };

describe("ShelfSection source line", () => {
  it("names a country's Apple Music chart and when it was fetched", () => {
    render(
      <ShelfSection
        shelf={{ id: "hot", scope: "country", country: "JP", language: null, songs: [song], chartCountries: ["JP"], updatedAt: "2026-10-30T07:00:00.000Z" }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText(/Source: Apple Music Top 50 in Japan · updated Oct 30/)).toBeTruthy();
  });

  it("counts the charts a pooled shelf draws on", () => {
    render(
      <ShelfSection
        shelf={{ id: "hot", scope: "language", country: null, language: "es", songs: [song], chartCountries: ["MX", "ES", "AR"] }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Source: Apple Music Top 50 charts from 3 countries")).toBeTruthy();
  });

  it("names the one country a pooled shelf drew on, and never says zero", () => {
    const { unmount } = render(
      <ShelfSection
        shelf={{ id: "hot", scope: "language", country: null, language: "de", songs: [song], chartCountries: ["DE"] }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Source: Apple Music Top 50 in Germany")).toBeTruthy();
    unmount();
    render(
      <ShelfSection shelf={{ id: "hot", scope: "world", country: null, language: null, songs: [song] }} onSelect={() => {}} />
    );
    expect(screen.getByText("Source: Apple Music Top 50 charts")).toBeTruthy();
  });

  it("names the window a country's rooms list counted", () => {
    render(
      <ShelfSection
        shelf={{ id: "rooms", scope: "country", country: "FR", language: null, songs: [{ ...song, roomShare: 40 }], windowDays: 30 }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Source: songs queued in KaraoQ rooms over the last 30 days")).toBeTruthy();
  });

  it("credits KaraoQ rooms for the rooms shelf", () => {
    render(
      <ShelfSection
        shelf={{ id: "rooms", scope: "world", country: null, language: null, songs: [{ ...song, roomShare: 12 }] }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Source: songs queued in KaraoQ rooms over the last 14 days")).toBeTruthy();
    expect(screen.getByText("12% of rooms")).toBeTruthy();
  });
});
