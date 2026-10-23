#!/usr/bin/env bash
set -euo pipefail

TARBALL="${1:?usage: karaoq-activate <release-tarball> <git-sha>}"
SHA="${2:?usage: karaoq-activate <release-tarball> <git-sha>}"

RELEASES_DIR=/opt/karaoq/releases
CURRENT_LINK=/opt/karaoq/current
KEEP=5
HEALTH_TIMEOUT=60
HEALTH_URL=http://127.0.0.1:3000/api/health
ROOT_URL=http://127.0.0.1:3000/

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
# karaoq (the service user, root-owned everywhere else) needs write access
# under .next for Next's ISR cache.
chown -R karaoq:karaoq "$TMP_DIR/.next"
echo "KARAOQ_VERSION=${SHA:0:7}" > "$TMP_DIR/release.env"
chmod 644 "$TMP_DIR/release.env"
mv -T "$TMP_DIR" "$RELEASE_DIR"

point_to() {
  local target="$1"
  local tmp_link="${CURRENT_LINK}.tmp"
  ln -sfn "$target" "$tmp_link"
  mv -T "$tmp_link" "$CURRENT_LINK"
  systemctl restart karaoq
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

point_to "$RELEASE_DIR"

if ! wait_healthy; then
  echo "karaoq-activate: $RELEASE_NAME failed health check" >&2
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    echo "karaoq-activate: rolling back to $PREVIOUS_RELEASE" >&2
    point_to "$PREVIOUS_RELEASE"
  fi
  exit 1
fi

cd "$RELEASES_DIR"
ls -1 | grep -v '^\.' | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
  old_path="$RELEASES_DIR/$old"
  if [ "$old_path" = "$RELEASE_DIR" ] || [ "$old_path" = "$PREVIOUS_RELEASE" ]; then
    continue
  fi
  rm -rf -- "$old_path"
done
