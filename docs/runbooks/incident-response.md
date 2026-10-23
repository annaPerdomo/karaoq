# Incident response

## Severity

- **Sev1** — production down or data at risk (site unreachable, DB errors,
  active data loss).
- **Sev2** — a feature broken or degraded for users, no data risk (search
  failing, queue not advancing).
- **Sev3** — degraded but workaround exists, or staging/internal only.

## First 15 minutes

1. **Confirm it's real.** `curl https://www.karaoq.live/api/health` (or the
   VM directly over SSH if DNS is the suspect — see
   `docs/runbooks/deploy-and-rollback.md`). Check
   `docs/runbooks/monitoring.md`'s external uptime monitor and
   `journalctl -u karaoq-error-spike`.
2. **Check what just changed.** Last deploy (`gh run list --workflow
   deploy-vm.yml`), last cron run (`tail /var/log/karaoq/cron.log`), any
   manual secret rotation in the last hour.
3. **If it's a bad deploy:** `sudo karaoq-activate --rollback production`
   (see `docs/runbooks/deploy-and-rollback.md`). This is almost always faster
   than debugging forward.
4. **If a feature is the problem, not the whole app:** flip its kill switch
   rather than rolling back everything else with it. Flags live in
   `lib/featureFlags.ts` (`songs_pages`, `boards_posting`, `corpus_cron`),
   read with up to 60s of staleness by running instances.

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
