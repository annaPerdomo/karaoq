import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  SONG_SECTIONS,
  COUNTRY_CONFIG,
  LANGUAGE_PACKS,
  orderSections,
  type SongSection,
} from "../../app/queue/songSuggestions";
import { cleanSongTitle } from "../../pages/api/suggestions/trending";

const SECTION_IDS = SONG_SECTIONS.map((s) => s.id);
const PACKS_DIR = path.join(__dirname, "../../public/suggestions");

function loadPack(packId: string): SongSection {
  const raw = fs.readFileSync(path.join(PACKS_DIR, `${packId}.json`), "utf8");
  return JSON.parse(raw);
}

describe("COUNTRY_CONFIG", () => {
  it("every sectionOrder id references a real section", () => {
    for (const [country, config] of Object.entries(COUNTRY_CONFIG)) {
      for (const id of config.sectionOrder) {
        expect(SECTION_IDS, `${country} references unknown section ${id}`).toContain(id);
      }
    }
  });

  it("every referenced regional pack file exists and is valid JSON", () => {
    const packIds = new Set(
      Object.values(COUNTRY_CONFIG)
        .map((c) => c.regionalPack)
        .filter((p): p is string => Boolean(p))
    );
    for (const packId of packIds) {
      expect(() => loadPack(packId), `pack ${packId}`).not.toThrow();
    }
  });

  it("country codes are uppercase ISO-alpha-2", () => {
    for (const code of Object.keys(COUNTRY_CONFIG)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("orderSections country modes", () => {
  it.each([
    ["MX", "spanish"],
    ["ES", "spanish"],
    ["AR", "spanish"],
    ["KR", "kpop"],
    ["JP", "japanese"],
  ])("%s puts %s first", (country, firstId) => {
    expect(orderSections(SONG_SECTIONS, country)[0].id).toBe(firstId);
  });

  it.each([
    ["BR"], ["PT"], ["PH"], ["DE"], ["AT"], ["CH"], ["IN"],
    ["ID"], ["MY"], ["CZ"], ["SK"], ["FR"], ["BE"],
  ])(
    "%s keeps default order and has a regional pack",
    (country) => {
      expect(orderSections(SONG_SECTIONS, country).map((s) => s.id)).toEqual(SECTION_IDS);
      expect(COUNTRY_CONFIG[country].regionalPack).toBeTruthy();
    }
  );

  it("unknown or null country leaves the order unchanged", () => {
    expect(orderSections(SONG_SECTIONS, "FR").map((s) => s.id)).toEqual(SECTION_IDS);
    expect(orderSections(SONG_SECTIONS, null).map((s) => s.id)).toEqual(SECTION_IDS);
  });

  it("never drops or duplicates sections", () => {
    for (const country of Object.keys(COUNTRY_CONFIG)) {
      const ids = orderSections(SONG_SECTIONS, country).map((s) => s.id);
      expect([...ids].sort()).toEqual([...SECTION_IDS].sort());
    }
  });

  it("does not mutate the input array", () => {
    const before = SONG_SECTIONS.map((s) => s.id);
    orderSections(SONG_SECTIONS, "KR");
    expect(SONG_SECTIONS.map((s) => s.id)).toEqual(before);
  });
});

describe("LANGUAGE_PACKS", () => {
  it("every pack in the manifest has a valid JSON file", () => {
    for (const { packId } of LANGUAGE_PACKS) {
      expect(() => loadPack(packId), packId).not.toThrow();
    }
  });

  it("covers every regionalPack referenced by COUNTRY_CONFIG", () => {
    const manifestIds = new Set(LANGUAGE_PACKS.map((p) => p.packId));
    for (const [country, config] of Object.entries(COUNTRY_CONFIG)) {
      if (config.regionalPack) {
        expect(manifestIds.has(config.regionalPack), `${country} pack missing from manifest`).toBe(true);
      }
    }
  });

  it("pack ids and labels are unique", () => {
    const ids = LANGUAGE_PACKS.map((p) => p.packId);
    const labels = LANGUAGE_PACKS.map((p) => p.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("regional pack files", () => {
  const packIds = ["br", "ph", "de", "in", "id", "cz", "fr"];

  it.each(packIds)("%s.json has a valid SongSection shape", (packId) => {
    const pack = loadPack(packId);
    expect(typeof pack.id).toBe("string");
    expect(typeof pack.label).toBe("string");
    expect(pack.categories.length).toBeGreaterThan(0);
    for (const cat of pack.categories) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(cat.emoji).toBeTruthy();
      expect(cat.songs.length).toBeGreaterThanOrEqual(10);
      for (const song of cat.songs) {
        expect(song.title).toBeTruthy();
        expect(song.artist).toBeTruthy();
        if (song.nativeTitle !== undefined) {
          expect(typeof song.nativeTitle).toBe("string");
          expect(song.nativeTitle).toBeTruthy();
        }
        if (song.nativeArtist !== undefined) {
          expect(typeof song.nativeArtist).toBe("string");
          expect(song.nativeArtist).toBeTruthy();
        }
      }
    }
  });

  it("pack section and category ids do not collide with built-in ones", () => {
    const builtinSectionIds = new Set(SECTION_IDS);
    const builtinCatIds = new Set(
      SONG_SECTIONS.flatMap((s) => s.categories.map((c) => c.id))
    );
    for (const packId of packIds) {
      const pack = loadPack(packId);
      expect(builtinSectionIds.has(pack.id)).toBe(false);
      for (const cat of pack.categories) {
        expect(builtinCatIds.has(cat.id), `${packId}/${cat.id}`).toBe(false);
        expect(cat.id).not.toBe("trending");
      }
    }
  });
});

describe("cleanSongTitle", () => {
  it("strips karaoke-video noise", () => {
    expect(cleanSongTitle("Queen - Bohemian Rhapsody (Karaoke Version)")).toBe(
      "Queen - Bohemian Rhapsody"
    );
    expect(cleanSongTitle("Africa - Toto [Karaoke with Lyrics HD]")).toBe(
      "Africa - Toto"
    );
    expect(cleanSongTitle("Dancing Queen karaoke")).toBe("Dancing Queen");
  });

  it("leaves clean titles alone", () => {
    expect(cleanSongTitle("Mr. Brightside - The Killers")).toBe(
      "Mr. Brightside - The Killers"
    );
  });
});
