# Task 07 — cutover

Read `README.md` first. Depends on: 01–06 all complete. Human (Anna) in the loop.

## Objective

One reviewed PR, one deploy. This folds the pre-existing uncommitted branch work AND
phase 1 together — that is a locked decision, not an accident.

## Pre-flight

1. `npx tsc --noEmit -p tsconfig.json` clean; `pnpm exec vitest run` fully green.
2. Retire the live tools that target the legacy store: delete `tests/populateCatalog.test.ts`
   and `tests/probeHarvest.test.ts` OR port them to the corpus (coverage tool from task 03
   supersedes `tests/coverageReport.test.ts`'s old version). `tests/quotaProbe.test.ts` can
   stay (store-agnostic). No env-gated tool may reference `suggestion_videos`.
3. Comment pass: run `/trim-comments` over the branch diff.
4. Fresh-eyes review: run `/vet` (all uncommitted work). Fix SHOULD FIX findings; get
   Anna's call on anything NEEDS DISCUSSION.
5. Live-DB checks with the env-gated tools (`.env.local`):
   - migration dry-run expectations documented in task 03's coverage tool
   - confirm `search.list` availability isn't required for any of it.

## Commit & PR

1. Branch off main (do not commit to main): `song-corpus-phase-1`.
2. Use `/stage-features` to group the work into coherent commits (the pending branch work
   and phase 1 land as separate logical commits where they separate cleanly).
3. `/pr` — remember Anna's preference: **no test-plan section in PR bodies**; solo repo.

## Deploy checklist (Anna + executor together)

1. Vercel env vars before merge: `CRON_SECRET` (required — the cron route is closed
   without it). Optional: `SUGGESTION_RESOLVE_PER_RUN`, `KARAOKE_CHANNELS`,
   `KARAOKE_PLAYLISTS`.
2. Merge; wait for production deploy.
3. Trigger the cron manually with search disabled and watch the report:
   `curl -X POST "https://karaoq.live/api/cron/suggestions?search=0" -H "Authorization: Bearer $CRON_SECRET"`
   Expect: migrate step progressing/complete, sweep counts, no 5xx, < 300s.
4. Re-run until `migrate-v1` reports done (it is resumable by design).
5. Verify the invariant in prod: from a phone/browser on a room, tap a known-resolved
   suggestion ("Dancing Queen — ABBA") → results appear; response header
   `x-karaoq-suggestions: corpus`; Vercel logs show zero calls to
   `googleapis.com/youtube/v3/search` for that request.
6. Tap an unresolved suggestion → falls through to search (or the quota copy if spent) —
   today's behavior, no regression.
7. Run the coverage tool against prod data; record the numbers in the PR as the phase-1
   closing comment.

## Rollback

The client falls through to search whenever `/cuts` 404s or errors, and `/api/search` minus
the catalog branch is behavior-identical to pre-corpus search — so a bad corpus state
degrades to current-production behavior rather than an outage. True rollback = revert the
merge commit; the new collections are additive and can sit unused.

## After this task

Phase 1 is done. Next: `phase-2.md` (expand before executing). Do NOT drop
`suggestion_videos` yet — phase 3 owns cleanup after the soak.
