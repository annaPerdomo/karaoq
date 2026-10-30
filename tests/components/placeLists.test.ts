import { describe, it, expect } from "vitest";
import { SONG_SECTIONS } from "../../app/queue/songSuggestions";
import {
  placeLists,
  placesFor,
  sectionIdForPlace,
  surprisePool,
} from "../../components/songsearch/placeLists";
import type { GenreShelf } from "../../lib/shelfTypes";

const ids = (groups: { heading: string | null; categories: { id: string }[] }[]) =>
  groups.map((g) => [g.heading, g.categories.map((c) => c.id)]);

describe("sectionIdForPlace", () => {
  it("shares a language's list across its countries", () => {
    expect(sectionIdForPlace("MX")).toBe("spanish");
    expect(sectionIdForPlace("AR")).toBe("spanish");
    expect(sectionIdForPlace("JP")).toBe("japanese");
    expect(sectionIdForPlace("IN")).toBe("bollywood");
    expect(sectionIdForPlace("PH")).toBe("opm");
  });

  it("has nothing for an English-speaking or unknown place", () => {
    expect(sectionIdForPlace("GB")).toBeNull();
    expect(sectionIdForPlace("")).toBeNull();
  });
});

describe("placeLists", () => {
  const japanese = SONG_SECTIONS.find((s) => s.id === "japanese")!;

  it("gives a place elsewhere only its own lists, genres and voice apart", () => {
    const lists = placeLists("JP", false, SONG_SECTIONS);
    expect(lists.genres).toHaveLength(1);
    expect(lists.genres[0].heading).toBeNull();
    expect(lists.genres[0].categories.every((c) => !c.voice)).toBe(true);
    expect(lists.genres[0].categories.map((c) => c.id)).toContain("jp-anime");
    expect(lists.voice[0].categories.map((c) => c.voice).sort()).toEqual(["easy", "high", "low", "mid"]);
    expect(lists.voice[0].categories.every((c) => japanese.categories.indexOf(c) >= 0)).toBe(true);
  });

  it("keeps the international lists under a singer's own place", () => {
    const lists = placeLists("JP", true, SONG_SECTIONS);
    expect(lists.genres.map((g) => g.heading)).toEqual(["local", "international"]);
    expect(lists.genres[1].categories.map((c) => c.id)).toContain("crowd-pleasers");
    expect(lists.voice[1].categories.map((c) => c.id)).toContain("low-voice");
  });

  it("gives an English-speaking place the core lists", () => {
    expect(ids(placeLists("GB", true, SONG_SECTIONS).voice)).toEqual([
      [null, ["low-voice", "mid-voice", "high-voice", "easy-sing"]],
    ]);
  });

  it("falls back to the core lists while a place's pack hasn't loaded", () => {
    const lists = placeLists("PH", false, SONG_SECTIONS);
    expect(lists.genres[0].categories.map((c) => c.id)).toContain("crowd-pleasers");
  });
});

describe("placesFor", () => {
  it("leads with the singer's own place when it isn't a charted one", () => {
    expect(placesFor("LK")[0]).toBe("LK");
    expect(placesFor(null)[0]).toBe("");
    expect(placesFor("US").filter((p) => p === "US")).toHaveLength(1);
  });
});

describe("surprisePool", () => {
  const coreSongs = new Set(
    SONG_SECTIONS.filter((s) => s.id === "genre" || s.id === "voice-type")
      .flatMap((s) => s.categories)
      .flatMap((c) => c.songs)
  );
  const genre = (slug: string, keys: string[], country = "TW"): GenreShelf => ({
    slug,
    name: slug,
    emoji: "🎵",
    country,
    store: country,
    songs: keys.map((key) => ({ key, title: `T ${key}`, artist: `A ${key}` })),
  });

  it("draws a home place's songs only from its own lists, never the international ones", () => {
    const pool = surprisePool(placeLists("JP", true, SONG_SECTIONS), []);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.some((p) => coreSongs.has(p.song))).toBe(false);
  });

  it("adds the place's genre charts, carrying each song's key", () => {
    const pool = surprisePool(placeLists("JP", false, SONG_SECTIONS), [genre("anime", ["k1", "k2"], "JP")]);
    expect(pool.filter((p) => p.key).map((p) => p.key)).toEqual(["k1", "k2"]);
  });

  it("keeps the core lists for a place without lists of its own, with its charts on top", () => {
    const pool = surprisePool(placeLists("US", true, SONG_SECTIONS), [genre("country", ["c1"], "US")]);
    expect(pool.some((p) => coreSongs.has(p.song))).toBe(true);
    expect(pool.filter((p) => p.key).map((p) => p.key)).toEqual(["c1"]);
  });

  it("leaves out a chart of another country's music", () => {
    const jp = surprisePool(placeLists("JP", false, SONG_SECTIONS), [genre("kpop", ["k1"], "JP")]);
    const kr = surprisePool(placeLists("KR", false, SONG_SECTIONS), [genre("kpop", ["k2"], "KR")]);
    expect(jp.some((p) => p.key)).toBe(false);
    expect(kr.map((p) => p.key)).toContain("k2");
  });
});
