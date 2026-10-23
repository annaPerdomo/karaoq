#!/usr/bin/env bash
set -euo pipefail

UNIT="${1:-unknown unit}"
MESSAGE="karaoq: $UNIT failed"

if [ -n "${NTFY_OPS_TOPIC:-}" ]; then
  curl -fsS --max-time 5 -d "$MESSAGE" "https://ntfy.sh/$NTFY_OPS_TOPIC" > /dev/null 2>&1 || true
else
  echo "$MESSAGE (NTFY_OPS_TOPIC unset, not paging)" >&2
fi
