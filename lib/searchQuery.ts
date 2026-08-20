// The one place the "karaoke" rule lives. If the client's append rule and the
// server's normalize rule drift, one intent keys two cache entries and spends
// two of the day's ~100 live searches.

const KARAOKE_RE = /\bkaraoke\b/i;

// RegExp instead of literals: the project targets ES5, where tsc rejects the /u
// flag outright. Every runtime we ship to has it.
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");
const NOT_ALPHANUMERIC = new RegExp("[^\\p{L}\\p{N}]+", "gu");

/** Casing is deliberately left alone: YouTube ignores it and the cache key is
 *  lowercased anyway. */
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

/** Skips the suffix when the singer already typed the word — so toggling
 *  karaoke mode on such a query is a no-op the caller can skip re-running. */
export function buildSearchQuery(raw: string, karaokeMode: boolean): string {
  const q = normalizeSearchQuery(raw);
  return karaokeMode && !KARAOKE_RE.test(q) ? `${q} karaoke` : q;
}

/** Folds punctuation and accents — "abba: waterloo!", "Beyoncé" — onto one
 *  entry. Only the key is folded; the query sent to YouTube keeps both, which
 *  do help it. */
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
