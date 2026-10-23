# Rotate secrets

## When to use

Scheduled rotation, a suspected leak, or offboarding something that had
access. Each secret below lives in more than one place — update all of them
or you'll get a confusing partial outage.

## Steps

### YouTube Data API key (`YOUTUBE_API_KEY`)

1. Create a new key in the GCP project (or a new restricted key in the same
   project), restrict it to the YouTube Data API v3.
2. Update:
   - VM: `/etc/karaoq/env` (production) and `/etc/karaoq/staging.env`
     (staging's own GCP project/key — never the same key, see
     `deploy/README.md` "Staging"), then `sudo systemctl restart karaoq`
     (or `karaoq-staging`).
   - Vercel (until DNS cutover): Project Settings → Environment Variables →
     `YOUTUBE_API_KEY`, redeploy.
3. Delete the old key in GCP only after confirming the new one works (next
   section).

### `CRON_SECRET`

Lives in three places — all three must change together or the cron curl
calls start 401ing:

- VM: `/etc/karaoq/cron-secret` (0600, root-only; `deploy/crontab` reads it
  with `cat`, not `EnvironmentFile`).
- GitHub Actions secret `CRON_SECRET` (`.github/workflows/corpus-run.yml`).
- Vercel env var `CRON_SECRET` (until DNS cutover retires `vercel.json`'s
  crons).

### `ANALYTICS_SECRET`

Gates every `/api/analytics/*` route (`lib/adminAuth.ts`, header
`x-analytics-secret`). Update `/etc/karaoq/env` / `staging.env` and Vercel's
env var, restart the service(s). Anything that calls admin endpoints
(the admin dashboard, this repo's own scripts) needs the new value too.

### Mongo user/password

1. In Atlas, add a new database user (don't edit the existing one in place —
   this way the old credential kept working until step 3).
2. Update `MONGODB_URI` in `/etc/karaoq/env` / `staging.env`, the GitHub
   secrets (`MONGODB_URI`, `STAGING_MONGODB_URI`, `SMOKE_MONGODB_URI` if it
   shares the user), and Vercel's env var. Restart affected services /
   redeploy.
3. Once everything is confirmed healthy, delete the old Atlas user.

Backup/restore use a separate, read-only Atlas user
(`BACKUP_MONGODB_URI` in `/etc/karaoq/backup.env`) — rotate it the same way,
independently.

### R2 token (backup bucket)

1. Cloudflare dashboard → R2 → Manage API Tokens → create a new token
   scoped to the backup bucket only.
2. Update `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in
   `/etc/karaoq/backup.env`.
3. Run `mongo-backup.sh` once by hand to confirm the new token works, then
   revoke the old token.

### Cloudflare Tunnel credentials

1. `cloudflared tunnel create karaoq-rotated` (or rotate the existing
   tunnel's token from the Cloudflare dashboard — Zero Trust → Networks →
   Tunnels → the tunnel → rotate token).
2. Copy the new credentials file to `/etc/cloudflared/`, update
   `deploy/cloudflared.yml`'s `tunnel`/`credentials-file` if the tunnel ID
   changed.
3. `sudo systemctl restart cloudflared`, confirm it reconnects
   (`journalctl -u cloudflared -f`), then delete the old tunnel/credentials.

## Verify

After each rotation:

```
curl http://127.0.0.1:3000/api/health          # app + Mongo still reachable
tail -20 /var/log/karaoq/cron.log               # last cron run was 200, not 401
```

For YouTube/R2/tunnel specifically, trigger the thing that uses it once
(a search, `mongo-backup.sh` by hand, a request through the tunnel) rather
than assuming the config change took.

## Rollback

Put the old value back in whichever file(s) you changed and restart/redeploy
— every secret above stays valid until you explicitly revoke it in its
provider (GCP, Atlas, Cloudflare), so rotation is reversible right up until
that last step.
