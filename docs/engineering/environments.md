# Environments

## Prod

`karaoq.live`, deployed via `deploy/`'s VM path (see `deploy/README.md`) once
cutover happens; `main` on Vercel until then. `NODE_ENV=production`,
`MONGODB_DB=karaoq`. `KARAOQ_ENV=production` on the VM (`lib/platform.ts`'s
`isProductionDeploy()`); Vercel sets `VERCEL_ENV=production` itself.

## Staging / preview

Vercel preview deployments off any branch/PR. `NODE_ENV=production` (Vercel
sets this for every build), `VERCEL_ENV=preview`. Today these share the same
`MONGODB_DB=karaoq` as prod — see `shared_prod_dev_db` in project notes — so
`lib/dbGuard.ts`'s warning doesn't fire here (`NODE_ENV` is `production`).

## Dev / local

`next dev`, `NODE_ENV=development`. Should point `MONGODB_DB` at a separate
database, `karaoq_dev`, on the same Atlas cluster. `lib/dbGuard.ts`'s
`databaseRoleWarning()` logs a `console.warn` once per process (from
`getMongoClient()`) when a non-production process is still pointed at
`MONGODB_DB=karaoq`; set `KARAOQ_ALLOW_PROD_DB=1` to silence it deliberately,
or just point `MONGODB_DB` at the dev database to make the warning go away
for good.

## Creating the free dev cluster/database

1. In Atlas, either reuse the existing free-tier cluster or create a second
   free M0 cluster.
2. Create a database named `karaoq_dev` (any collection name creates it;
   Mongo collections are created lazily by the app anyway).
3. Add your local/CI egress IP to the cluster's Network Access list.
4. Set `MONGODB_URI`/`MONGODB_DB=karaoq_dev` in `.env.local` (not checked in).
5. CI/test runs that hit a real server should also point at `karaoq_dev`, not
   `karaoq` — `tests/` normally mocks `lib/mongodb.ts` entirely, so this only
   matters for a manual or integration run against a live database.
