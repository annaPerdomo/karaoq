# Task 04 — cron rewrite + refresh sweep

Read `README.md` first. Depends on: 01–03. Blocks: 05 (serving assumes sweep hygiene).

## Objective

Rewrite `pages/api/cron/suggestions.ts` as a resumable work queue over corpus steps. The
current file's auth (`CRON_SECRET` bearer, closed when unset), `envCount`, `?search=0`
switch, and run-report logging all carry over — the step bodies change.

## Runner contract

```ts
// Each step gets a deadline and returns what it did; the runner executes steps in order
// until each reports complete or the deadline passes, then responds with the report.
// Hard context: Vercel caps functions at 300s and a full harvest measured 335s — no step
// may assume it finishes. Budget: stop starting new work at ~240s elapsed.
type Step = (deadline: number) => Promise<{ done: boolean; report: Record<string, unknown> }>;
```

Cursor persistence via `cron_state` (task 01). Note: the pre-corpus cron already persists
per-channel harvest cursors in a `harvest_cursors` collection (`_id` = handle, plus
`playlistId` / `pageToken` / `completedAt`) — fold that into `cron_state` rather than
building a second cursor store, and carry over its total-page budget, which is what stops
a 35-channel sweep from outspending the whole day's unit pool. `vercel.json` gains a second daily
invocation at `15 8 * * *` as the continuation slot — same handler, it just resumes
wherever the cursors point (idempotent steps make double-invocation safe).

## Steps, in order (cheap and user-visible first)

1. **migrate** — task 03's step; O(1) skip once done.
2. **sweep** — the compliance mechanism. Oldest `refreshedAt` first, batches of 50:
   one `videos.list` call per batch (reuse `fetchVideoRows`-style fetch in
   `lib/suggestionResolver.ts`, `part=snippet,contentDetails,statistics,status`). Update
   title/thumb/duration/viewCount, rewrite `refreshedAt`. A video that comes back missing
   or `embeddable === false` is deleted, pulled from any `karaoke_songs.cuts`, and a
   dangling `topVideoId` unset. Per-run cap 400 docs (`envCount("SWEEP_PER_RUN", 400)`).
3. **harvest** — adapt `seedFromKaraokeChannels` (`lib/suggestionResolver.ts`) to write via
   `recordHarvestMatches` (task 02) instead of `suggestion_videos`. Budget as a **total**
   page count for the sweep (currently `CHANNEL_PAGES=800`, `60` per channel), never a
   per-channel cap multiplied by the handle list — 35 channels × 400 pages was a 14,035-unit
   ceiling against a 10,000/day pool. Channels resume from their saved cursor, so depth
   comes from successive nights rather than one long run. Keep `karaokeChannelHandles()` +
   `karaokePlaylistIds()` sources and the strict matcher untouched.
4. **resolve** — `search.list`, the ONLY caller in the codebase. Target: `karaoke_songs`
   with `cuts: []`, ordered by `demand` desc, cap `SUGGESTION_RESOLVE_PER_RUN` (default 40).
   Search via `searchYoutubeApi(song.query-equivalent, "any", "relevance")` — rebuild the
   query with `buildSearchQuery(`${artist} ${title}`, true)` semantics; write results into
   the corpus (videos + cuts). Stop the whole step on the first quota error (current
   `resolveBySearch` behavior). Leftover budget widens thin songs (`cuts.length < 10`,
   demand-ordered) — port `thinEntries`. Honors `?search=0`.

Keep: run-report JSON to console + response. Drop from the old file: everything reading or
writing `suggestion_videos` (`seedFromSearchCache` included — the migration supersedes it),
and `pinPopularPicks` (recordAdd now maintains `topVideoId` continuously).

## Tests (`tests/api/cronSuggestions.test.ts`, all collections mocked)

1. Unset `CRON_SECRET` → 401; wrong bearer → 401.
2. Deadline already passed → every step returns done:false, cursors persisted, 200 with
   report (never a 500 on timeout).
3. Sweep: missing + unembeddable videos deleted and pulled from cuts; dangling topVideoId
   unset; survivors get new `refreshedAt`.
4. Resolve stops on quota error mid-list and reports how far it got.
5. `?search=0` → zero `search.list` fetches (assert on the fetch mock's URLs).
6. Step order: a run with a tight budget executes migrate/sweep before any harvest fetch.

## Acceptance

tsc clean; suite green; grep the repo for `youtube/v3/search?` — matches must be exactly
`lib/youtubeSearch.ts` (definition) and nothing outside the resolve step calling it.
