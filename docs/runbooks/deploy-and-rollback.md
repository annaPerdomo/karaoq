# Deploy and rollback

## When to use

Shipping a change to production, checking it on a preview first, or undoing
a bad one.

## Steps

Vercel deploys from git; there is no deploy workflow to run.

- **Preview** — push a branch / open a PR. Vercel builds a preview
  deployment and links it on the PR. Previews share the production database
  unless the Preview environment sets its own `MONGODB_DB`
  (`docs/engineering/environments.md`).
- **Production** — merge or push to `main`. Vercel builds and promotes it to
  `https://www.karaoq.live`.
- **Env var change** — edit it in Vercel → Project Settings → Environment
  Variables, then redeploy; running deployments keep the old value:

  ```
  vercel redeploy <deployment-url>
  ```

Crons (`vercel.json`) ship with the deployment: four slots of
`/api/cron/suggestions` at 04:15, 05:15, 06:47 (mopUp), 07:47 (mopUp) UTC.
Pro fires them on the minute. To run one by hand:

```
gh workflow run corpus-run.yml -f query=slot=manual
```

## Verify

```
curl https://www.karaoq.live/api/health
BASE_URL=https://www.karaoq.live pnpm smoke     # readonly mode
```

Health returns `{"ok":true,"version":"<sha>","db":"ok",...}` — check
`version` matches the commit you shipped. Point `BASE_URL` at the preview URL
to check a preview the same way. Build and runtime logs are on the
deployment's page in the Vercel dashboard.

## Rollback

Instant Rollback points production back at a previous deployment without
rebuilding:

```
vercel rollback                    # to the previous production deployment
vercel rollback <deployment-url>   # to a specific one
```

Or in the dashboard: Deployments → pick a previous production deployment →
Instant Rollback (or Promote to Production). Re-check health above.

A rollback doesn't revert env vars or database state. After one, Vercel
stops auto-promoting new `main` builds to production until you promote one
(`vercel promote <deployment-url>`) or undo the rollback in the dashboard —
fix or revert the bad commit on `main` first, then promote its build.
