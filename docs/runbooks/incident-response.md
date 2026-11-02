# Incident response

## Severity

- **Sev1** — production down or data at risk (site unreachable, DB errors,
  active data loss).
- **Sev2** — a feature broken or degraded for users, no data risk (search
  failing, queue not advancing).
- **Sev3** — degraded but workaround exists, or preview/internal only.

## First 15 minutes

1. **Confirm it's real.** `curl https://www.karaoq.live/api/health` — a 503
   with `"db":"error"` means Mongo, not the app. Check the Vercel dashboard
   (deployment status, runtime logs) and `/admin` (client errors, search
   health) — see `docs/runbooks/monitoring.md`.
2. **Check what just changed.** Last production deployment (Vercel
   dashboard, or `vercel ls`), last cron run (Vercel → Cron Jobs / logs for
   `/api/cron/suggestions`), any env var change or secret rotation in the
   last hour.
3. **If it's a bad deploy:** `vercel rollback` (see
   `docs/runbooks/deploy-and-rollback.md`). This is almost always faster
   than debugging forward.
4. **If a feature is the problem, not the whole app:** flip its kill switch
   rather than rolling back everything else with it. Flags live in the Mongo
   `feature_flags` collection, read via `lib/featureFlags.ts` with up to 60s
   of staleness per running instance:

   - `songs_pages` — `/songs` and `/songs/[country]` return 404. Turning it
     off regenerates the cached pages right away; turning it back on takes
     up to 5 minutes per page.
   - `boards_posting` — the suggestions and sing-with-me board endpoints
     return 503.
   - `corpus_cron` — `/api/cron/suggestions` skips its run. The cron reads
     this one fresh every run, and skips if it can't read it.

   ```
   curl -X PUT https://www.karaoq.live/api/analytics/flags \
     -H "x-analytics-secret: $ANALYTICS_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"name":"corpus_cron","enabled":false,"note":"<why, and your name>"}'
   ```

   Check current state first with `GET` on the same endpoint (same header,
   no body). Flip it back the same way once resolved — flags don't expire.
5. **If it's quota/capacity, not a bug:** see the Aug 15 and Oct 22
   postmortems (`docs/postmortems/`) for what this has looked like before.
   The standing rule is demand reduction, never rationing a room's searches.
   For Vercel spend, check the Usage tab and the spend limit
   (`docs/runbooks/monitoring.md`).
6. **Database issue:** don't improvise a fix against production data. Follow
   `docs/runbooks/restore-database.md` — it restores into a scratch db first
   for exactly this reason.

## Comms template

Post this (wherever you track it — issue, note, whatever) as soon as you've
done step 1-2 above, then update it at major transitions:

```
INCIDENT: <one-line summary>
Severity: Sev<1|2|3>
Started: <UTC time, or "unknown">
Impact: <who/what is affected>
Status: investigating | mitigated | resolved
Next update: <time or "on resolution">
```

## After

Sev1/Sev2 gets a postmortem (`docs/postmortems/TEMPLATE.md`) within a few
days, while the timeline is still fresh. Sev3 doesn't need one unless it
recurs.
