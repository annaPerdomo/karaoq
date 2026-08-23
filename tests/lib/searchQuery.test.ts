import { describe, it, expect } from "vitest";

import {
  buildSearchQuery,
  normalizeSearchQuery,
  searchCacheKey,
} from "../../lib/searchQuery";

describe("normalizeSearchQuery", () => {
  it("trims and collapses runs of whitespace", () => {
    expect(normalizeSearchQuery("  Abba   Waterloo ")).toBe("Abba Waterloo");
  });

  it("drops a karaoke suffix an older client already stacked on", () => {
    expect(normalizeSearchQuery("abba waterloo karaoke karaoke")).toBe(
      "abba waterloo karaoke"
    );
  });

  it("collapses a suffix that isn't adjacent to the singer's own word", () => {
    // Only trailing *runs* used to collapse, so this kept keying separately from
    // "abba karaoke live".
    expect(normalizeSearchQuery("abba karaoke live karaoke")).toBe(
      "abba karaoke live"
    );
  });

  it("leaves the only karaoke in the query alone", () => {
    expect(normalizeSearchQuery("abba waterloo karaoke")).toBe(
      "abba waterloo karaoke"
    );
    expect(normalizeSearchQuery("karaoke karaoke")).toBe("karaoke");
    expect(normalizeSearchQuery("karaoke")).toBe("karaoke");
  });

  it("keeps the singer's casing — the cache key is lowercased separately", () => {
    expect(normalizeSearchQuery("Abba Waterloo Karaoke karaoke")).toBe(
      "Abba Waterloo Karaoke"
    );
  });
});

describe("buildSearchQuery", () => {
  it("appends the suffix in karaoke mode", () => {
    expect(buildSearchQuery("abba waterloo", true)).toBe("abba waterloo karaoke");
  });

  it("skips the suffix when the singer already typed the word", () => {
    expect(buildSearchQuery("Karaoke Queen", true)).toBe("Karaoke Queen");
    expect(buildSearchQuery("abba karaoke", true)).toBe("abba karaoke");
  });

  it("leaves the query alone with karaoke mode off", () => {
    expect(buildSearchQuery("  abba   waterloo ", false)).toBe("abba waterloo");
  });

  it("agrees with the server's normalization, so one intent keys one entry", () => {
    for (const raw of ["abba waterloo", "abba karaoke", "karaoke", "  a  b  "]) {
      for (const mode of [true, false]) {
        const sent = buildSearchQuery(raw, mode);
        expect(normalizeSearchQuery(sent)).toBe(sent);
      }
    }
  });
});

describe("searchCacheKey", () => {
  it("folds the ways people punctuate the same song onto one entry", () => {
    const key = searchCacheKey("abba waterloo");
    for (const spelling of [
      "ABBA - Waterloo",
      "abba: waterloo!",
      "Abba — Waterloo?",
      "ABBA   waterloo",
    ]) {
      expect(searchCacheKey(spelling)).toBe(key);
    }
  });

  it("folds accents, so an accented singer isn't a second live search", () => {
    expect(searchCacheKey("Beyoncé Halo")).toBe(searchCacheKey("beyonce halo"));
    expect(searchCacheKey("Björk")).toBe(searchCacheKey("bjork"));
  });

  it("keeps non-Latin queries intact rather than flattening them away", () => {
    // \w-based folding keys every Japanese and Korean query as "".
    expect(searchCacheKey("上を向いて歩こう")).toBe("上を向いて歩こう");
    // NFKD splits hangul syllables into jamo — fine for an opaque key.
    expect(searchCacheKey("아파트 - 로제")).toBe(searchCacheKey("아파트 로제"));
    expect(searchCacheKey("아파트 로제")).not.toBe(searchCacheKey("소주 한 잔"));
    expect(searchCacheKey("아파트 로제")).not.toBe("");
  });

  it("keys a query the same however the client composed its characters", () => {
    // Built with normalize() rather than pasted literals, so the fixtures can't
    // silently become byte-identical and turn this into a tautology.
    const song = "Cafe\u0301 del Mar";
    expect(song.normalize("NFD")).not.toBe(song.normalize("NFC"));
    expect(searchCacheKey(song.normalize("NFD"))).toBe(
      searchCacheKey(song.normalize("NFC"))
    );
  });

  it("still tells different songs apart", () => {
    expect(searchCacheKey("abba waterloo")).not.toBe(searchCacheKey("abba mamma mia"));
  });
});
