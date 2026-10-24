import { describe, it, expect } from "vitest";
import { buildPlaces, defaultPlace } from "../../components/songsearch/hooks/useWorldPlaces";
import { SONG_SECTIONS } from "../../app/queue/songSuggestions";

describe("defaultPlace", () => {
  it("opens on a remembered pick while it's still offered", () => {
    expect(defaultPlace(["JP", "KR", "US"], "US", "KR")).toBe("KR");
    expect(defaultPlace(["JP", "US"], "US", "KR")).toBe("JP");
  });

  it("skips the singer's own country", () => {
    expect(defaultPlace(["JP", "US"], "JP", null)).toBe("US");
    expect(defaultPlace(["AR", "CL"], "AR", null)).toBe("CL");
  });

  it("falls back to anything offered, or nothing", () => {
    expect(defaultPlace(["US"], "US", null)).toBe("US");
    expect(defaultPlace([], "US", null)).toBeNull();
  });
});

describe("buildPlaces", () => {
  const japanese = SONG_SECTIONS.find((s) => s.id === "japanese")!;
  const chart = (country: string) => ({
    id: "world" as const,
    scope: "country" as const,
    country,
    language: null,
    songs: [],
  });

  it("pairs a chart with its place's classics, and keeps places that have only one", () => {
    const places = buildPlaces([chart("JP"), chart("US")], [japanese]);
    expect(places.find((p) => p.country === "JP")).toMatchObject({ section: japanese });
    expect(places.find((p) => p.country === "JP")!.chart?.country).toBe("JP");
    expect(places.find((p) => p.country === "US")).toMatchObject({ section: null });
  });

  it("offers classics for a place whose chart isn't deep enough yet", () => {
    const places = buildPlaces([], [japanese]);
    expect(places).toEqual([{ country: "JP", chart: null, section: japanese }]);
  });
});
