# Restore the database

## When to use

Data loss or corruption in production or staging, or proving a backup is
actually restorable (do this routinely, not just during an incident).

## Steps

Always restore into a **scratch database first** — never directly into
`karaoq`. Find the backup to use:

```
aws s3 ls --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com s3://$R2_BUCKET/mongo/
```

Restore it into a scratch db:

```
RESTORE_MONGODB_URI='mongodb+srv://...' \
  /opt/karaoq/deploy/backup/restore.sh mongo/karaoq-<timestamp>.archive.gz karaoq_restore_check
```

(or `RESTORE_MONGODB_URI_FILE=<600-perm file>` instead of the env var — see
`deploy/README.md` "Backups"). This drops and repopulates only
`karaoq_restore_check`, not the live database.

Inspect it before touching production:

```
mongosh "$RESTORE_MONGODB_URI" --eval 'db.getSiblingDB("karaoq_restore_check").rooms.countDocuments()'
```

Only once that looks right, cut over. Stop the app first so nothing writes to
the target db mid-restore:

```
sudo systemctl stop karaoq   # or karaoq-staging
RESTORE_MONGODB_URI='mongodb+srv://...' \
  /opt/karaoq/deploy/backup/restore.sh mongo/karaoq-<timestamp>.archive.gz karaoq --i-mean-production
sudo systemctl start karaoq
```

`restore.sh` refuses `target-db=karaoq` without `--i-mean-production` —
that's deliberate; don't work around it by restoring to a differently-named
db and renaming collections by hand.

## Verify

```
curl http://127.0.0.1:3000/api/health
mongosh "$RESTORE_MONGODB_URI" --eval 'db.getSiblingDB("karaoq").rooms.countDocuments()'
```

Health returns `{"ok":true}`; room/queue counts match what you expected from
the backup's timestamp.

## Rollback

If the restore itself was wrong (restored the wrong archive, or into the
wrong db), the pre-restore state is still in the *next* most recent R2
backup — repeat the steps above against that object key. There is no
built-in "undo"; this is why the scratch-db check above exists — catch the
mistake before it touches `karaoq`.
