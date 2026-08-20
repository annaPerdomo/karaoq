# Task 02 — corpus feeders

Read `README.md` first. Depends on: 01. Blocks: 03, 04, 05.

## Objective

Every song a human queues, and every video the harvest matches, lands in the corpus.
Create `lib/songCorpus.ts` as the single write module; wire two feeders into it.

## Part A — `lib/songCorpus.ts`

```ts
// recordAdd: fire-and-forget upsert on the add path (pattern: writeSuggestionVideos).
// Increments sources.adds + addsByCountry, sets songKey when the add carried a
// suggestionKey, bumps the song's addCount/lastAddedAt, recomputes topVideoId as the
// cut with the highest sources.adds.count among the song's cuts, and appends the video
// to cuts if absent (respecting the 12 cap — evict the lowest-ranked, never topVideoId).
export function recordAdd(video: {
  videoId: string; title: string; thumbnailUrl?: string; durationSeconds?: number;
}, opts: { country?: string; suggestionKey?: string; via: "search" | "paste" }): void;

// recordHarvestMatches: bulk upsert from the channel/playlist harvest (task 04 calls it).
// Sets sources.harvest, songKey, and fills the song's cuts (cap 12) without disturbing
// add-derived ranking — harvest rows append after add-ranked rows.
export async function recordHarvestMatches(
  matches: Map<string, MatchedVideo[]>,          // songKey -> lib/suggestionMatch rows
  details: Map<string, SearchResult>              // videoId -> enriched row (videos.list)
): Promise<{ videosUpserted: number; songsFilled: number }>;
```

Both must be idempotent — re-running with the same input changes nothing but timestamps.
`refreshedAt` is set on every upsert (a fresh write IS fresh data). `firstSeenAt` only via
`$setOnInsert`.

## Part B — the add hook

In `pages/api/queue/[id]/videos.ts`, after the successful queue write (where
`trackEvent(req, "song_added", …)` fires): call `recordAdd(...)` fire-and-forget.

- The handler already has `videoId`, `songTitle`, `durationSeconds`, `via`, and
  `suggestionKey` in scope.
- Country: reuse whatever geo extraction `lib/analytics.ts` uses for `trackEvent`
  (`extractGeo` or equivalent — export it if module-private; do not duplicate the parsing).
- This one hook covers paste adds too (`via: "paste"` flows through the same endpoint), so
  there is NO separate lookup feeder — note this if you find the design doc saying otherwise.
- Do not `await` it ahead of the response; do not let a corpus failure fail an add.

## Part C — song identity seed helper

Export `songIdentityFromCatalog(entry: CatalogEntry): Omit<KaraokeSongDoc, "cuts" | ...>`
mapping `lib/suggestionCatalog.ts` entries (title/artist/native*/packId) onto song docs.
Task 03 and the resolver both use it; keep it pure.

## Tests (`tests/lib/songCorpus.test.ts`, mocked collections)

1. recordAdd on an unknown video creates video + updates song (cuts gains the id).
2. recordAdd twice with the same video increments counts once each, no duplicate cut.
3. recordAdd without suggestionKey creates the video UNGROUPED (no songKey, no song write).
4. topVideoId follows the most-added cut and never leaves `cuts`.
5. Cut cap: 13th distinct video evicts the lowest-ranked, never topVideoId.
6. recordHarvestMatches is idempotent (call twice, assert equal state).
7. Add hook test in `tests/api/videos.test.ts` style: successful add calls recordAdd; a
   rejected recordAdd promise does not fail the request (mock it to reject).

## Acceptance

tsc clean; suite green; every new public function has the "why" comment style of
`lib/suggestionVideos.ts`.

## Out of scope

Reading paths, cron wiring, migration of old data.
