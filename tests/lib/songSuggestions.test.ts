import { describe, it, expect } from "vitest";
import {
  SONG_SECTIONS,
  ALL_CATEGORIES,
  getRandomSuggestion,
  buildSongQuery,
} from "../../app/queue/songSuggestions";

describe("songSuggestions", () => {
  describe("SONG_SECTIONS", () => {
    it("has all expected sections", () => {
      const ids = SONG_SECTIONS.map((s) => s.id);
      expect(ids).toContain("genre");
      expect(ids).toContain("voice-type");
      expect(ids).toContain("spanish");
      expect(ids).toContain("kpop");
      expect(ids).toContain("japanese");
    });

    it("every section has a label and at least one category", () => {
      for (const section of SONG_SECTIONS) {
        expect(section.label).toBeTruthy();
        expect(section.categories.length).toBeGreaterThan(0);
      }
    });

    it("every category has a unique id", () => {
      const ids = ALL_CATEGORIES.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every category has an emoji, name, and at least 10 songs", () => {
      for (const cat of ALL_CATEGORIES) {
        expect(cat.emoji).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.songs.length).toBeGreaterThanOrEqual(10);
      }
    });

    it("every song has a title and artist", () => {
      for (const cat of ALL_CATEGORIES) {
        for (const song of cat.songs) {
          expect(song.title).toBeTruthy();
          expect(song.artist).toBeTruthy();
        }
      }
    });
  });

  describe("ALL_CATEGORIES", () => {
    it("is the flat list of all categories across sections", () => {
      const expected = SONG_SECTIONS.flatMap((s) => s.categories);
      expect(ALL_CATEGORIES).toEqual(expected);
    });
  });

  describe("getRandomSuggestion", () => {
    it("returns a song with title, artist, and category", () => {
      const result = getRandomSuggestion();
      expect(result.title).toBeTruthy();
      expect(result.artist).toBeTruthy();
      expect(result.category).toBeTruthy();
    });

    it("returns different results across multiple calls", () => {
      const results = new Set(
        Array.from({ length: 20 }, () => getRandomSuggestion().title)
      );
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe("buildSongQuery", () => {
    it("combines artist and title", () => {
      expect(buildSongQuery({ title: "Bohemian Rhapsody", artist: "Queen" }))
        .toBe("Queen Bohemian Rhapsody");
    });
  });
});
