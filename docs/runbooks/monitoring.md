# Monitoring

No push alerting or paging, by design — the owner checks these by hand.
Quota-trip paging is deliberately disabled too.

## Health endpoint

`https://www.karaoq.live/api/health` (`pages/api/health.ts`) pings Mongo
(2s timeout, result cached 5s) and returns:

- `200 {"ok":true,"version":"<sha>","db":"ok","uptimeS":...}`
- `503 {"ok":false,...,"db":"error"}` when the ping fails or times out.

`version` is the deployment's short git sha, so it also tells you what is
live.

## Vercel dashboard

- **Deployments / Logs** — build failures and runtime errors per
  deployment.
- **Cron Jobs** — the four `/api/cron/suggestions` slots from `vercel.json`.
- **Usage** — function invocations, Active CPU, edge requests. Watch this
  after any change to polling or heartbeats; those are what grew usage past
  Hobby (`docs/postmortems/2026-10-22-vercel-hobby-limits.md`).

## `/admin`

The in-app admin page: client errors (the `client_errors` pipeline, Errors
view), the search health card (YouTube search failures and quota), and
live rooms.

## Spend

Vercel Pro is $20/mo including $20 of usage credit; usage runs about
$1.50/mo, and a 10x month is estimated around $23. The owner sets the spend
limit in Vercel → Settings → Billing — keep an on-demand budget so the bill
can't pass $30.
