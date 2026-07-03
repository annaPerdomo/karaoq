import { describe, it, expect } from "vitest";
import {
  SONG_SECTIONS,
  ALL_CATEGORIES,
  getRandomSuggestion,
  buildSongQuery,
  displaySongTitle,
  displaySongArtist,
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

    it("native fields, when present, are non-empty strings", () => {
      for (const cat of ALL_CATEGORIES) {
        for (const song of cat.songs) {
          if (song.nativeTitle !== undefined) {
            expect(song.nativeTitle).toBeTruthy();
          }
          if (song.nativeArtist !== undefined) {
            expect(song.nativeArtist).toBeTruthy();
          }
        }
      }
    });

    it("K-Pop and Japanese sections carry native-script fields", () => {
      for (const sectionId of ["kpop", "japanese"]) {
        const section = SONG_SECTIONS.find((s) => s.id === sectionId)!;
        const songs = section.categories.flatMap((c) => c.songs);
        const withNative = songs.filter((s) => s.nativeTitle || s.nativeArtist);
        expect(withNative.length).toBeGreaterThan(0);
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

    it("prefers native-script fields when present", () => {
      expect(
        buildSongQuery({
          title: "Mayonaka no Door",
          artist: "Miki Matsubara",
          nativeTitle: "真夜中のドア",
          nativeArtist: "松原みき",
        })
      ).toBe("松原みき 真夜中のドア");
    });

    it("falls back per-field when only one native field exists", () => {
      expect(
        buildSongQuery({ title: "Dynamite", artist: "BTS", nativeArtist: "방탄소년단" })
      ).toBe("방탄소년단 Dynamite");
    });
  });

  describe("display helpers", () => {
    it("shows native script first with romanization in parentheses", () => {
      const song = {
        title: "Mayonaka no Door",
        artist: "Miki Matsubara",
        nativeTitle: "真夜中のドア",
        nativeArtist: "松原みき",
      };
      expect(displaySongTitle(song)).toBe("真夜中のドア (Mayonaka no Door)");
      expect(displaySongArtist(song)).toBe("松原みき (Miki Matsubara)");
    });

    it("falls back to romanized-only when no native fields", () => {
      const song = { title: "Bohemian Rhapsody", artist: "Queen" };
      expect(displaySongTitle(song)).toBe("Bohemian Rhapsody");
      expect(displaySongArtist(song)).toBe("Queen");
    });
  });
});
