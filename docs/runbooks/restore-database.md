# Restore the database

## When to use

Data loss or corruption in production, or proving a backup is actually
restorable (do this routinely, not just during an incident).

## Backups

`.github/workflows/backup.yml` runs `scripts/ops/mongo-backup.sh` nightly at
10:30 UTC (and on `workflow_dispatch`): `mongodump` of `karaoq` →
`s3://karaoq-backups/mongo/karaoq-<timestamp>.archive.gz` on Cloudflare R2.
The bucket's lifecycle rule expires `mongo/` after 30 days. The job is
skipped until the repo secrets `BACKUP_MONGODB_URI`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are set — check the latest
run actually uploaded before relying on it.

## Steps

Run from a laptop with `mongodb-database-tools`, `mongosh` and the `aws` CLI
installed, from the repo root:

```
export R2_ACCOUNT_ID=... R2_BUCKET=karaoq-backups
export AWS_ACCESS_KEY_ID=<R2 access key id> AWS_SECRET_ACCESS_KEY=<R2 secret> AWS_DEFAULT_REGION=auto
export RESTORE_MONGODB_URI='mongodb+srv://...'   # a user with write access, not the read-only backup user
```

Find the backup to use:

```
aws s3 ls --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com s3://$R2_BUCKET/mongo/
```

Always restore into a **scratch database first** — never directly into
`karaoq`:

```
scripts/ops/restore.sh mongo/karaoq-<timestamp>.archive.gz karaoq_restore_check
```

(`RESTORE_MONGODB_URI_FILE=<path>` works instead of the env var.) This drops
and repopulates only `karaoq_restore_check`. Inspect it:

```
mongosh "$RESTORE_MONGODB_URI" --eval 'db.getSiblingDB("karaoq_restore_check").rooms.countDocuments()'
```

Only once that looks right, cut over. There's no switch that stops the app
writing — the kill switches (`docs/runbooks/incident-response.md`) only
reduce writes: turn off `corpus_cron` (corpus resolver) and
`boards_posting` (board posts); rooms and queues keep writing. Restore
during a quiet hour and accept that writes landing mid-restore may be lost
(`--drop` replaces each collection):

```
scripts/ops/restore.sh mongo/karaoq-<timestamp>.archive.gz karaoq --i-mean-production
```

`restore.sh` refuses `target-db=karaoq` without `--i-mean-production` —
that's deliberate; don't work around it by restoring to a differently-named
db and renaming collections by hand. The restore also replaces
`feature_flags` with the backup's copy, so the switches you just turned off
revert to whatever the backup had — check them afterwards with `GET
/api/analytics/flags` and set them how you want.

## Verify

```
curl https://www.karaoq.live/api/health
mongosh "$RESTORE_MONGODB_URI" --eval 'db.getSiblingDB("karaoq").rooms.countDocuments()'
```

Health returns `{"ok":true,...}`; room/queue counts match what you expected
from the backup's timestamp. Drop `karaoq_restore_check` when done.

## Rollback

If the restore itself was wrong (wrong archive, or wrong db), the
pre-restore state is still in the *next* most recent R2 backup — repeat the
steps above against that object key. There is no built-in "undo"; this is
why the scratch-db check exists — catch the mistake before it touches
`karaoq`.
