# Load testing

`load/k6-rooms.js` models `ROOMS` (default 10) concurrent karaoke rooms for
5 minutes: each room gets one VU that polls like a display (every 1.5s), a
host (every 3s), four singers (every 8s), and hits `/api/search` once every
3 minutes as a stand-in for a song add (a real add needs a real YouTube
video id, which would burn quota on every run).

## Where it can run

`load/lib/guard.js` only allows `localhost`, `127.0.0.1` and `[::1]`.
It refuses everything else — production (`www.karaoq.live`) and Vercel
preview URLs included. The script also refuses to start unless
`K6_TARGET_DB` is set to something other than `karaoq`.

So today the only working target is a local production build
(`pnpm build && pnpm start`) with `MONGODB_DB=karaoq_dev` in `.env.local`:

```
K6_TARGET_DB=karaoq_dev BASE_URL=http://localhost:3000 ROOMS=10 k6 run load/k6-rooms.js
```

Running it against a Vercel preview would need a preview host added to the
guard's allowlist first. If that happens, know what it costs:

- **Previews share the production Atlas database** unless the Preview
  environment sets a different `MONGODB_DB` — set one, and pass that name as
  `K6_TARGET_DB`.
- **Load hits Vercel usage**, which is billed on Pro
  (`docs/runbooks/monitoring.md`, "Spend").
- **It shares Atlas M0 with production** (one cluster) — see the ceiling
  below.

Room creation is rate-limited to 10 per 5 minutes per IP (the
`room-create` limit in `pages/api/queue/[id]/index.ts`), so the script
refuses `ROOMS` above 10.

## Reading results

k6 prints a summary at the end. The thresholds that make a run pass or fail:

- `http_req_duration` p95 under 800ms
- `http_req_failed` rate under 1%

A failing threshold means the run exits non-zero. Look at which endpoint's
checks failed in the per-group breakdown to tell a slow display poll from a
slow search.

## Cleanup

Rooms created by the test (`LOAD<vu><suffix>` codes, printed by the
teardown step) expire on their own via the 30-day room TTL
(`lib/mongodb.ts`). To remove them immediately instead, reuse
`tests/e2e/lib/cleanup.mjs`'s `cleanupRooms()` with the printed codes.

## The M0 ceiling

Atlas's free M0 tier tops out around **~100 operations/second** before
latency climbs sharply, and dev and prod share the cluster — a local run
against `karaoq_dev` still spends production's headroom. `ROOMS=10` is
roughly 20-25 ops/s; run it when rooms are quiet.
