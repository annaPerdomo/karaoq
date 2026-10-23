#!/usr/bin/env bash
set -euo pipefail

USAGE="usage: karaoq-activate <release-tarball> <git-sha> [--target production|staging]
       karaoq-activate --rollback <production|staging>"

fail_usage() {
  echo "$USAGE" >&2
  exit 1
}

TARGET=production
ROLLBACK=false
TARBALL=""
SHA=""

[ "$#" -ge 1 ] || fail_usage

if [ "$1" = "--rollback" ]; then
  [ "$#" -eq 2 ] || fail_usage
  ROLLBACK=true
  TARGET="$2"
else
  case "$#" in
    2)
      TARBALL="$1"
      SHA="$2"
      ;;
    4)
      TARBALL="$1"
      SHA="$2"
      [ "$3" = "--target" ] || fail_usage
      TARGET="$4"
      ;;
    *)
      fail_usage
      ;;
  esac
fi

case "$TARGET" in
  production)
    BASE=/opt/karaoq
    SERVICE=karaoq
    SERVICE_USER=karaoq
    PORT=3000
    ;;
  staging)
    BASE=/opt/karaoq-staging
    SERVICE=karaoq-staging
    SERVICE_USER=karaoq-staging
    PORT=3001
    ;;
  *)
    fail_usage
    ;;
esac

RELEASES_DIR="$BASE/releases"
CURRENT_LINK="$BASE/current"
HISTORY_FILE="$BASE/history"
KEEP=5
HEALTH_TIMEOUT=60
HEALTH_URL="http://127.0.0.1:$PORT/api/health"
ROOT_URL="http://127.0.0.1:$PORT/"

point_to() {
  local target="$1"
  local tmp_link="${CURRENT_LINK}.tmp"
  ln -sfn "$target" "$tmp_link"
  mv -T "$tmp_link" "$CURRENT_LINK"
  systemctl restart "$SERVICE"
}

wait_healthy() {
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -fsS --max-time 2 "$HEALTH_URL" > /dev/null 2>&1 \
      && curl -fsS --max-time 2 "$ROOT_URL" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

record_history() {
  echo "$1" >> "$HISTORY_FILE"
}

if [ "$ROLLBACK" = true ]; then
  [ -f "$HISTORY_FILE" ] || { echo "karaoq-activate: no history for $TARGET" >&2; exit 1; }

  CURRENT_RELEASE=""
  if [ -L "$CURRENT_LINK" ]; then
    CURRENT_RELEASE="$(readlink -f "$CURRENT_LINK")"
  fi

  HISTORY_LINES="$(wc -l < "$HISTORY_FILE")"
  if [ "$HISTORY_LINES" -lt 2 ]; then
    echo "karaoq-activate: no prior release in history for $TARGET" >&2
    exit 1
  fi
  PRIOR_RELEASE="$(tail -n 2 "$HISTORY_FILE" | head -n 1)"

  if [ ! -d "$PRIOR_RELEASE" ]; then
    echo "karaoq-activate: prior release $PRIOR_RELEASE no longer exists" >&2
    exit 1
  fi

  point_to "$PRIOR_RELEASE"
  if ! wait_healthy; then
    echo "karaoq-activate: rollback to $PRIOR_RELEASE failed health check" >&2
    if [ -n "$CURRENT_RELEASE" ] && [ -d "$CURRENT_RELEASE" ]; then
      echo "karaoq-activate: reverting to $CURRENT_RELEASE" >&2
      point_to "$CURRENT_RELEASE"
    fi
    exit 1
  fi

  record_history "$PRIOR_RELEASE"
  echo "karaoq-activate: rolled back $TARGET to $(basename "$PRIOR_RELEASE")"
  exit 0
fi

RELEASE_NAME="$(date -u +%Y%m%dT%H%M%SZ)-$SHA"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_NAME"

if [ -e "$RELEASE_DIR" ]; then
  echo "karaoq-activate: $RELEASE_DIR already exists" >&2
  exit 1
fi

PREVIOUS_RELEASE=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

TMP_DIR="$(mktemp -d "$RELEASES_DIR/.extract.XXXXXX")"
chmod 755 "$TMP_DIR"
tar --no-same-owner -xzf "$TARBALL" -C "$TMP_DIR"
find "$TMP_DIR" -type d -exec chmod 755 {} +
find "$TMP_DIR" -type f -exec chmod 644 {} +
# The service user (root-owned everywhere else) needs write access under
# .next for Next's ISR cache.
chown -R "$SERVICE_USER:$SERVICE_USER" "$TMP_DIR/.next"
echo "KARAOQ_VERSION=${SHA:0:7}" > "$TMP_DIR/release.env"
chmod 644 "$TMP_DIR/release.env"
mv -T "$TMP_DIR" "$RELEASE_DIR"

point_to "$RELEASE_DIR"

if ! wait_healthy; then
  echo "karaoq-activate: $RELEASE_NAME failed health check" >&2
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    echo "karaoq-activate: rolling back to $PREVIOUS_RELEASE" >&2
    point_to "$PREVIOUS_RELEASE"
  fi
  mv -T "$RELEASE_DIR" "$RELEASE_DIR.failed"
  exit 1
fi

record_history "$RELEASE_DIR"

cd "$RELEASES_DIR"
ls -1 | grep -v '^\.' | grep -v '\.failed$' | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
  old_path="$RELEASES_DIR/$old"
  if [ "$old_path" = "$RELEASE_DIR" ] || [ "$old_path" = "$PREVIOUS_RELEASE" ]; then
    continue
  fi
  rm -rf -- "$old_path"
done
