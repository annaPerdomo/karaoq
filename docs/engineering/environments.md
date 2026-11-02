# Environments

Dev and prod currently share one Atlas cluster; databases are what separate
them.

## Production

`https://www.karaoq.live` (apex redirects to `www`), Vercel Pro project
`karaoq`, deployed on every push to `main`. `NODE_ENV=production`,
`VERCEL_ENV=production` (set by Vercel), `MONGODB_DB=karaoq`. Env vars live
in Vercel → Project Settings → Environment Variables; changing one needs a
redeploy to take effect.

## Preview

A Vercel preview deployment per PR branch. `NODE_ENV=production` (Vercel
sets it for every build), `VERCEL_ENV=preview`. Unless the Preview
environment sets its own `MONGODB_DB`, previews use **the production
database** (`karaoq`) — anything you do on a preview writes real data.
`lib/dbGuard.ts` treats `VERCEL_ENV=preview` as non-production, so this
logs its warning.

There is no staging environment. The GCP project `karaoq-staging` exists for
a future staging YouTube API key; nothing uses it yet.

## CI

ci.yml's `smoke` job builds and runs the app against `SMOKE_MONGODB_URI`
(database `karaoq_ci`) and is skipped until that secret is set. Point it at
the shared cluster, in its own database, so the smoke suite's `QA`-prefixed
rooms never land in `karaoq` or `karaoq_dev`.

## Dev / local

`next dev`, `NODE_ENV=development`, `MONGODB_DB=karaoq_dev` on the same
cluster. `lib/dbGuard.ts`'s `databaseRoleWarning()` logs a `console.warn`
once per process (from `getMongoClient()`) when a non-production process is
pointed at `MONGODB_DB=karaoq`; set `KARAOQ_ALLOW_PROD_DB=1` to silence it
deliberately, or point `MONGODB_DB` at `karaoq_dev` to make it go away.

## Creating the dev database

1. In Atlas, use the existing cluster.
2. Create a database named `karaoq_dev` (collections are created lazily by
   the app anyway).
3. Add your egress IP to the cluster's Network Access list.
4. Set `MONGODB_URI` and `MONGODB_DB=karaoq_dev` in `.env.local` (not
   checked in).
5. `tests/` normally mocks `lib/mongodb.ts` entirely; only a manual or
   integration run against a live server needs a real database, and it
   should be `karaoq_dev`, not `karaoq`.
