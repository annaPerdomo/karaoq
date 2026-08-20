# Task 03 — seed migration

Read `README.md` first. Depends on: 01, 02. Blocks: 04 (the cron runs this as its first step).

## Objective

Idempotent, resumable migration that seeds the corpus from what already exists — runs as a
cron step guarded by `cron_state` (`_id: "migrate-v1"`, `done: true` when complete), NOT as a
standalone script and NOT on import. Rationale: dev and prod share the database; the only
safe trigger is the authenticated cron.

## Sources, in order

1. **Curated identities.** For each of the ~876 entries in `suggestionCatalog()`
   (`lib/suggestionCatalog.ts`), upsert a `karaoke_songs` doc via
   `songIdentityFromCatalog` (task 02) with `cuts: []`, `demand: 0`. `$setOnInsert` only —
   never clobber a song that adds have already enriched.
2. **Resolved store.** For each `suggestion_videos` doc (interface in `lib/mongodb.ts`):
   upsert each of its `results` rows into `karaoke_videos` with `sources.seed: true` and
   `songKey` = the doc's `_id`; set the song's `cuts` to the results' videoIds (cap 12,
   existing order — it's already ranked) and carry `topVideoId` across. Preserve the store
   doc's `resolvedAt`/`refreshedAt` semantics by setting the video docs' `refreshedAt` to
   the store doc's `refreshedAt` (do NOT reset the 30-day clock to now — the sweep will
   refresh them on its own schedule).
3. **Demand.** Aggregate `suggestion_used` events (analytics DB, `analytics_events`) grouped
   by songTitle/songArtist exactly as `suggestionDemand()` in `pages/api/cron/suggestions.ts`
   does today, and write the counts onto `karaoke_songs.demand`.

`suggestion_videos` is left in place untouched (dropped in phase 3, after the cutover has
soaked).

## Resumability

Batch by 100 with the last processed key in `cron_state.cursor`; the step honors the time
budget passed by the cron runner (task 04) and returns "incomplete" to be resumed next run.
When all three sources are done, set `done: true` — subsequent runs skip in O(1).

## Tests (`tests/lib/corpusMigration.test.ts`, mocked collections)

1. Full run: N store docs + catalog → correct video/song docs; spot-check one song's cuts
   order and topVideoId carry-over.
2. Idempotence: second full run produces zero writes (assert updateOne call payloads or
   counts).
3. Resume: run with a budget that stops mid-batch, assert cursor; resume completes without
   reprocessing (no duplicate cuts).
4. A song enriched by an add BEFORE migration keeps its add-derived counts (setOnInsert
   semantics).

## Live verification tool (env-gated, for the human at cutover)

Extend or replace `tests/coverageReport.test.ts` with a corpus report:
songs total / with cuts / cutless, videos total, per-pack coverage. Same
`it.runIf(process.env.COVERAGE_LIVE)` + `.env.local` loader pattern. This tool is how task
07 verifies the migration against the real DB.

## Acceptance

tsc clean; suite green; migration code contains no top-level side effects (grep for calls
outside function bodies).
