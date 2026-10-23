#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_MONGODB_URI:?BACKUP_MONGODB_URI is not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ]; then
  echo "mongo-backup: RETENTION_DAYS must be an integer >= 1, got '$RETENTION_DAYS'" >&2
  exit 1
fi

ENDPOINT_URL="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="mongo/karaoq-$STAMP.archive.gz"
TMP_FILE="$(mktemp)"
CONFIG_FILE="$(mktemp)"
chmod 600 "$CONFIG_FILE"
trap 'rm -f "$TMP_FILE" "$CONFIG_FILE"' EXIT

# The URI (which carries credentials) goes in a 600 config file, not argv,
# so it never shows up in `ps` output for other users on the box.
printf 'uri: "%s"\n' "$BACKUP_MONGODB_URI" > "$CONFIG_FILE"

mongodump --config "$CONFIG_FILE" --db karaoq --archive --gzip > "$TMP_FILE"

aws s3 cp --endpoint-url "$ENDPOINT_URL" "$TMP_FILE" "s3://$R2_BUCKET/$KEY"

CUTOFF="$(date -u -d "-$RETENTION_DAYS days" +%Y-%m-%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%d)"
aws s3 ls --endpoint-url "$ENDPOINT_URL" "s3://$R2_BUCKET/mongo/" | while read -r line; do
  obj_date="$(echo "$line" | awk '{print $1}')"
  obj_name="$(echo "$line" | awk '{print $4}')"
  if [ -z "$obj_name" ] || [ "mongo/$obj_name" = "$KEY" ]; then
    continue
  fi
  if [ "$obj_date" \< "$CUTOFF" ]; then
    aws s3 rm --endpoint-url "$ENDPOINT_URL" "s3://$R2_BUCKET/mongo/$obj_name"
  fi
done

SIZE="$(du -h "$TMP_FILE" | cut -f1)"
echo "karaoq-backup: wrote $KEY ($SIZE)"
