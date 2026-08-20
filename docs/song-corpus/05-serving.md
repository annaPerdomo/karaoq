# Task 05 — serving

Read `README.md` first. Depends on: 01–04. Blocks: 07.

## Objective

Suggestion taps serve from the corpus; the catalog special-case leaves `/api/search`; a
user-paid search for a known song banks its results into the corpus.

## Part A — `GET /api/suggestions/cuts?song=<songKey>`

New endpoint `pages/api/suggestions/cuts.ts`:

1. Validate `song` (string, ≤200 chars). Light per-IP rate limit —
   `rateLimit(req, "cuts", 30, 60_000)` (`lib/limits.ts`); it's a Mongo read, not a spend.
2. Read the song; hydrate `cuts` from `karaoke_videos` (one `$in` query); order rows by the
   `cuts` array's order with `topVideoId` first and flagged `pinned: true` — reuse
   `pinTopFirst` from `lib/suggestionVideos.ts` (move it to a corpus-neutral home if that
   avoids importing the legacy module).
3. Respond with `SearchResult[]` — the EXACT shape `/api/search` returns (including
   optional `durationSeconds`/`viewCount`/`pinned`), so `SearchResults.tsx`, preview, add
   flow, and the "Most sung" badge render unchanged. Header `x-karaoq-suggestions: corpus`.
4. Empty/missing song or hydration coming back empty → `404 { code: 404 }`. Store errors →
   404 as well (client falls through to search; never a 5xx for a browse tap).

## Part B — client tap path

In `components/songsearch/hooks/useSongSearchState.ts`, `runSearch` already computes
`suggestionKey` when `fromSuggestion` is true. Change: when a suggestion tap has a key, try
`/api/suggestions/cuts` first (same AbortController + error discipline as `searchYoutube`);
on 404 or network failure, fall through to the existing `searchYoutube` call unchanged.
`resultsVia`/`resultsSuggestionKey` semantics stay identical either way. Add a thin client
wrapper in `app/queue/` beside `searchYoutube.ts` following its conventions.

## Part C — `/api/search` cleanup + search banking

In `pages/api/search.ts`:

1. Remove the catalog branch (`catalogEntry` / `isCatalogFilters` / `readSuggestionVideos`
   / `writeSuggestionVideos` imports and uses).
2. Where a **live** search succeeds (the `writeCache` site): if
   `isCatalogFilters(duration, sortBy)` and `searchCacheKey(normalizedQ)` matches a
   `karaoke_songs` doc, bank fire-and-forget: upsert result rows into `karaoke_videos`
   with `sources.search` and fill the song's cuts (cap 12). This is the loop where a
   user-paid search resolves a wanted song for everyone. Recognition must stay
   server-side — key lookup against `karaoke_songs`, never a client flag.

## Tests

Extend `tests/api/search.test.ts` (mock the corpus module): catalog branch gone — fresh
suggestion queries hit cache/live path; live success on a known songKey banks; unknown
queries never touch the corpus. New `tests/api/cuts.test.ts`: happy path with pinned-first
ordering, 404 on unknown/empty, rate-limit 429, header present. Hook tests
(`tests/components/useSongSearchState.test.ts` patterns): tap with cuts renders without
`searchYoutube` being called; 404 falls through to search; abort mid-cuts doesn't strand
`searching`.

## Acceptance

tsc clean; suite green; grep: `readSuggestionVideos`/`writeSuggestionVideos` have no
remaining callers outside their module and migration/tests.
