# Song Corpus — phase 1 execution guide

Full design: https://claude.ai/code/artifact/8e5f946a-47d4-4f8f-b5c8-ed4be6fb13c2 (reference only —
everything needed to execute is inlined in these task files; do not block on the URL).

## The invariant (the point of all of this)

**The browse view never shows a song it cannot serve instantly from our own store.
There is no code path from a suggestion tap to `search.list`.**

YouTube allows 100 `search.list` calls/day project-wide; one busy room used to burn all of
them. Suggestions therefore serve from a pre-resolved corpus, and `search.list` is spent in
exactly one place: the nightly cron's capped resolver, off the request path.

## Architecture in one paragraph

`karaoke_videos` (one doc per playable video; holds ALL YouTube-derived fields; TTL'd) is fed
by real adds, harvests, and capped nightly searches. `karaoke_songs` (one doc per song
identity; holds ZERO YouTube-derived fields; never expires) groups videos into ranked cuts.
A suggestion tap reads cuts from Mongo. Shelves (phase 2) rank songs per region.

## Execution order

| Task | File | Suggested model tier |
|---|---|---|
| 1. Collections | `01-collections.md` | small — mechanical, pattern-following |
| 2. Feeders | `02-feeders.md` | mid — touches request handlers |
| 3. Seed migration | `03-migration.md` | mid — data correctness matters |
| 4. Cron rewrite + sweep | `04-cron-sweep.md` | mid — resumability logic |
| 5. Serving | `05-serving.md` | mid — client + server integration |
| 6. Error copy | `06-copy.md` | small — exact strings provided |
| 7. Cutover | `07-cutover.md` | mid + human review |

Tasks 1→5 are strictly ordered. Task 6 is independent (any time). Task 7 last.
`phase-2.md` / `phase-3.md` are outlines only — expand before executing, don't execute as-is.

## Repo rules that will bite you (all discovered the hard way)

- **`npx tsc --noEmit -p tsconfig.json` must stay clean and `pnpm exec vitest run` green
  after every task.** Baseline at time of writing: 882 passed, 5 skipped.
- **TS target is ES5.** Regex literals with the `/u` flag fail to compile — build them with
  `new RegExp("...", "gu")` (see `lib/searchQuery.ts` for the precedent and comment).
  Spreading Map/Set iterators (`[...map.keys()]`) fails — use `Array.from(...)`.
- **Dev and production share one Atlas database.** Never write migration/backfill code that
  runs on import or on every request. Live-DB tools are env-gated vitest files using
  `it.runIf(Boolean(process.env.SOME_FLAG))` — see `tests/populateCatalog.test.ts`.
- **Unit tests never touch the real DB.** Mock `lib/mongodb` exports; follow
  `tests/api/search.test.ts` and `tests/lib/suggestionCatalog.test.ts` patterns.
- **i18n parity is test-enforced.** Any new UI string must exist in `lib/i18n/en.json` AND
  all 9 files in `public/i18n/` or `tests/lib/i18n.test.ts` fails.
- **Component files stay under ~300 lines** (CLAUDE.md). Split per its seams if approaching.
- **Comment discipline:** comments state constraints and "why", never narrate the change or
  the obvious. Match the surrounding density. No "added X" / "new" comments.
- **Mongo TTL indexes:** latch the ensure-flag even on failure and retune via `collMod`
  fallback — copy the `search_cache` / `suggestion_videos` pattern in `lib/mongodb.ts`
  verbatim, including its comments' reasoning. Never key dedupe on a non-`_id` unique index
  (see the `ops_alerts` comment for why).
- **Vercel functions cap at 300s.** Any batch job must bound its work and persist a cursor;
  a full channel harvest measured 335s. No step may assume it finishes.
- **Fire-and-forget writes** on request paths use the `writeCache` pattern:
  `promise.catch(() => {})`, never awaited ahead of the response unless the comment
  explains why.
- **Never** scrape YouTube outside the Data API, ration a room's searches, or touch the
  typed-search flow. `search.list` may only be called from the cron resolver.

## YouTube 30-day policy — the one structural rule

Every YouTube-derived field (title, thumbnail, duration, viewCount, videoId-as-data) lives in
`karaoke_videos` and nowhere else. That collection's TTL on `refreshedAt`
(= `YOUTUBE_DATA_MAX_AGE_DAYS` from `lib/youtubeRetention.ts`) plus the nightly `videos.list`
sweep IS the compliance mechanism. `karaoke_songs` holds only our own data (curated names,
counts, keys) plus videoId *references*. If a task needs a YouTube field somewhere else, the
task is wrong — hydrate from `karaoke_videos` at read time instead.

## Working-tree note

The tree contains ~45 uncommitted modified/new files (search cache improvements, query
normalization, `suggestion_videos` serving, admin dossier, harvest/matcher/resolver libs).
**This is intentional — do not revert, do not commit until task 7.** Phase 1 builds directly
on these files; several get reworked by tasks 2–5.

## Deviation from the design doc (intentional)

The doc's `wanted_songs` collection is collapsed into `karaoke_songs`: a song with
`cuts: []` IS the wanted list. One less collection, and "resolved" vs "wanted" can never
disagree. The chart feeder (phase 3) creates empty-cut song docs the same way.

## Definition of done for phase 1

1. A suggestion tap on a song with cuts returns them from Mongo — response header
   `x-karaoq-suggestions: corpus`, zero YouTube calls.
2. A tap on a cutless song falls through to today's search behavior (temporary until phase 2
   hides cutless songs).
3. Every `song_added` upserts into the corpus.
4. Nightly cron: migrate-once, sweep, harvest, resolve — each resumable, total < 240s/run.
5. `suggestion_videos` is no longer read by the serving path (dropped in phase 3, not now).
6. New quota-error copy live in 10 locales.
7. tsc clean; full suite green; `/vet` review passed; PR merged and deployed.
