import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

import SongChartPage from "../../components/songs/SongChartPage";
import { I18nProvider } from "../../lib/i18n/I18nProvider";

const SONGS = [
  { title: "Bohemian Rhapsody", artist: "Queen" },
  { title: "Dancing Queen", artist: "ABBA" },
];

describe("SongChartPage", () => {
  it("renders the ranked list and the CTA to the room-creation flow", () => {
    render(<SongChartPage songs={SONGS} updatedAt="2026-10-22T00:00:00.000Z" />);

    expect(screen.getByText(/Bohemian Rhapsody — Queen/)).toBeInTheDocument();
    expect(screen.getByText(/Dancing Queen — ABBA/)).toBeInTheDocument();

    const hostLink = screen.getByRole("link", { name: /Host a Session/i });
    expect(hostLink.getAttribute("href")).toBe("/?ref=songs");
  });

  it("shows the updating message and no list when empty", () => {
    const { container } = render(
      <SongChartPage songs={[]} updatedAt="2026-10-22T00:00:00.000Z" />
    );

    expect(screen.getByText(/updating/i)).toBeInTheDocument();
    expect(container.querySelectorAll("ol").length).toBe(0);
  });

  it("links back to the global list on a country page", () => {
    render(
      <SongChartPage
        songs={SONGS}
        country="us"
        countryName="United States"
        updatedAt="2026-10-22T00:00:00.000Z"
      />
    );

    expect(screen.getByText(/See the global list/i)).toBeInTheDocument();
  });

  it("renders in a non-English locale", () => {
    const esCatalog = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../public/i18n/es.json"), "utf8")
    );
    render(
      <I18nProvider initialLocale="es" initialCatalog={esCatalog}>
        <SongChartPage songs={SONGS} updatedAt="2026-10-22T00:00:00.000Z" />
      </I18nProvider>
    );

    expect(
      screen.getByText("Las canciones de karaoke más cantadas en KaraoQ")
    ).toBeInTheDocument();
    expect(screen.getByText(/Empieza tu propia noche de karaoke/)).toBeInTheDocument();
  });
});
