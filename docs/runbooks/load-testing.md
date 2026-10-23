# Load testing

`load/k6-rooms.js` models `ROOMS` (default 10) concurrent karaoke rooms for
5 minutes: each room gets one VU that polls like a display (every 1.5s), a
host (every 3s), four singers (every 8s), and hits `/api/search` once every
3 minutes as a stand-in for a song add (a real add needs a real YouTube
video id, which would burn quota on every run).

**Never run this until staging has its own Atlas cluster and its own
YouTube API key** (see "Staging (VM)" in `docs/engineering/environments.md`).
Staging currently shares infrastructure with other environments during
setup; running load against it before that isolation is in place would spend
someone else's database capacity or API quota.

**Run against staging only** (`next.karaoq.live`, or `localhost`/`127.0.0.1`
for a local dry run) — the script refuses any other host, and also refuses
to run unless `K6_TARGET_DB` is set to something other than `karaoq`, so it
can't accidentally point at the production database even via a misconfigured
`BASE_URL`.

```
K6_TARGET_DB=karaoq_staging BASE_URL=https://next.karaoq.live ROOMS=10 k6 run load/k6-rooms.js
```

Room creation is rate-limited to 10 per 5 minutes per IP
(`lib/limits.ts`'s `room-create` limit, enforced in
`pages/api/queue/[id]/index.ts`). `ROOMS` above 10 will start failing room
creation partway through `setup()` — stagger the creates or keep `ROOMS<=10`
until the script staggers it for you.

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
(`lib/mongodb.ts`), so no cleanup is required after a staging run. To remove
them immediately instead, reuse `tests/e2e/lib/cleanup.mjs`'s
`cleanupRooms()` with the printed codes.

## The M0 ceiling

Atlas's free M0 tier tops out around **~100 operations/second** before
latency climbs sharply. `ROOMS=10` (the default) is comfortably under that;
each room's traffic above is roughly 1 read every 0.4–0.5s on average, so
10 rooms is in the neighborhood of 20-25 ops/s. Use this script to find
where that ceiling actually sits for the current query patterns before
assuming headroom you don't have.
