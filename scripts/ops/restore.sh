#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: RESTORE_MONGODB_URI=... (or RESTORE_MONGODB_URI_FILE=<path>) restore.sh <object-key> <target-db> [--i-mean-production]" >&2
  exit 1
}

OBJECT_KEY="${1:-}"
TARGET_DB="${2:-}"
CONFIRM="${3:-}"

[ -n "$OBJECT_KEY" ] && [ -n "$TARGET_DB" ] || usage

if [ "$TARGET_DB" = "karaoq" ] && [ "$CONFIRM" != "--i-mean-production" ]; then
  echo "restore.sh: refusing to restore into the production database 'karaoq' without --i-mean-production" >&2
  exit 1
fi

if [ -n "${RESTORE_MONGODB_URI_FILE:-}" ]; then
  TARGET_URI="$(head -n 1 "$RESTORE_MONGODB_URI_FILE")"
elif [ -n "${RESTORE_MONGODB_URI:-}" ]; then
  TARGET_URI="$RESTORE_MONGODB_URI"
else
  echo "restore.sh: set RESTORE_MONGODB_URI or RESTORE_MONGODB_URI_FILE" >&2
  exit 1
fi

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"
ENDPOINT_URL="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

TMP_FILE="$(mktemp)"
CONFIG_FILE="$(mktemp)"
chmod 600 "$CONFIG_FILE"
trap 'rm -f "$TMP_FILE" "$CONFIG_FILE"' EXIT

# Same reasoning as mongo-backup.sh's config file.
printf 'uri: "%s"\n' "$TARGET_URI" > "$CONFIG_FILE"

aws s3 cp --endpoint-url "$ENDPOINT_URL" "s3://$R2_BUCKET/$OBJECT_KEY" "$TMP_FILE"
mongorestore --config "$CONFIG_FILE" --nsFrom "karaoq.*" --nsTo "$TARGET_DB.*" --archive --gzip --drop < "$TMP_FILE"

echo "restore.sh: restored $OBJECT_KEY into $TARGET_DB"
