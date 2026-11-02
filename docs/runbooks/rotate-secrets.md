# Rotate secrets

## When to use

Scheduled rotation, a suspected leak, or offboarding something that had
access. Secrets live in two places: Vercel env vars (Project Settings →
Environment Variables) and GitHub repo secrets (Settings → Secrets and
variables → Actions). Some live in both — update every copy or you'll get a
confusing partial outage. A Vercel env var change only takes effect after a
redeploy (`vercel redeploy <deployment-url>`).

## Steps

### YouTube Data API key (`YOUTUBE_API_KEY`)

1. Create a new key in the production GCP project, restricted to the
   YouTube Data API v3.
2. Update `YOUTUBE_API_KEY` in Vercel, redeploy.
3. Delete the old key in GCP only after confirming the new one works
   (Verify).

### `CRON_SECRET`

Two copies — both must change together or cron calls start 401ing:

- Vercel env var `CRON_SECRET` (Vercel sends it as the bearer token on
  `vercel.json`'s crons).
- GitHub secret `CRON_SECRET` (`.github/workflows/corpus-run.yml`).

### `ANALYTICS_SECRET`

Gates every `/api/analytics/*` route (`lib/adminAuth.ts`, header
`x-analytics-secret`), including the kill-switch endpoint. Vercel env var
only; redeploy. Anything that calls admin endpoints (the `/admin` login,
your own scripts) needs the new value too.

### Mongo user/password

1. In Atlas, add a new database user (don't edit the existing one in place —
   the old credential keeps working until step 3).
2. Update `MONGODB_URI` in Vercel (Production and Preview) and redeploy;
   update GitHub `SMOKE_MONGODB_URI` if it shares the user.
3. Once everything is confirmed healthy, delete the old Atlas user.

Backups use a separate, read-only Atlas user (GitHub secret
`BACKUP_MONGODB_URI`) — rotate it the same way, independently.

### R2 token (backup bucket)

1. Cloudflare dashboard → R2 → Manage API Tokens → create a new token
   scoped to `karaoq-backups` only.
2. Update GitHub secrets `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
3. Run the backup once (`gh workflow run backup.yml`) and confirm it
   uploads, then revoke the old token.

## Verify

```
curl https://www.karaoq.live/api/health            # app + Mongo reachable
gh workflow run corpus-run.yml -f query=slot=manual  # CRON_SECRET: run must be 200, not 401
```

The manual corpus run is a real run and spends YouTube quota; alternatively
wait for the next scheduled slot and check its status in Vercel → Cron Jobs.

For YouTube/R2 specifically, trigger the thing that uses it once (a search
on the live site, the backup workflow) rather than assuming the change
took.

## Rollback

Put the old value back in Vercel / GitHub and redeploy — every secret above
stays valid until you revoke it in its provider (GCP, Atlas, Cloudflare), so
rotation is reversible right up until that last step.
