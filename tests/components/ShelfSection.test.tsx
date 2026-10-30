import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ShelfSection from "../../components/songsearch/ShelfSection";

const song = { key: "k", title: "Song", artist: "Artist", rank: 1 };

describe("ShelfSection source line", () => {
  it("names a country's Apple Music chart and when it was fetched", () => {
    render(
      <ShelfSection
        shelf={{ id: "hot", scope: "country", country: "JP", language: null, songs: [song], charts: 1, updatedAt: "2026-10-30T07:00:00.000Z" }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText(/Source: Apple Music Top 50 in Japan · updated Oct 30/)).toBeTruthy();
  });

  it("counts the charts a pooled shelf draws on", () => {
    render(
      <ShelfSection
        shelf={{ id: "hot", scope: "language", country: null, language: "es", songs: [song], charts: 6 }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Source: Apple Music Top 50 charts from 6 countries")).toBeTruthy();
  });

  it("credits KaraoQ rooms for the rooms shelf", () => {
    render(
      <ShelfSection
        shelf={{ id: "rooms", scope: "world", country: null, language: null, songs: [{ ...song, rooms: 3 }] }}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Source: songs queued in KaraoQ rooms over the last 14 days")).toBeTruthy();
  });
});
