// If the client's append rule and the server's normalize rule drift, one intent
// keys two cache entries and spends two of the day's ~100 live searches.

const KARAOKE_RE = /\bkaraoke\b/i;

// RegExp instead of literals: the project targets ES5, where tsc rejects the /u
// flag outright. Every runtime we ship to has it.
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");
const NOT_ALPHANUMERIC = new RegExp("[^\\p{L}\\p{N}]+", "gu");

/** Casing is left alone: YouTube ignores it and the key is lowercased anyway. */
export function normalizeSearchQuery(raw: string): string {
  let q = raw.trim().replace(/\s+/g, " ");
  // Peel one suffix at a time, only while a "karaoke" survives in the rest, so
  // "karaoke karaoke" collapses to "karaoke" rather than to "".
  for (;;) {
    const stripped = q.replace(/\s+karaoke$/i, "");
    if (stripped === q || !KARAOKE_RE.test(stripped)) return q;
    q = stripped;
  }
}

export function buildSearchQuery(raw: string, karaokeMode: boolean): string {
  const q = normalizeSearchQuery(raw);
  return karaokeMode && !KARAOKE_RE.test(q) ? `${q} karaoke` : q;
}

// YouTube reads these as operators, and searchCacheKey folds them away: "abba
// dancing queen -karaoke" folds onto the key of the query it excludes.
const SEARCH_OPERATORS = /(^|\s)[-#]\S|["|]/;

export function hasSearchOperators(q: string): boolean {
  return SEARCH_OPERATORS.test(q);
}

/** Only the key is folded; the query sent to YouTube keeps its punctuation and
 *  accents, which do help it. */
export function searchCacheKey(q: string): string {
  return (
    q
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      // Unicode-aware: \w would flatten every Japanese or Korean query to "".
      .replace(NOT_ALPHANUMERIC, " ")
      .trim()
  );
}
