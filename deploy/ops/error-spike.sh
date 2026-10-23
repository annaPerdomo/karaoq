#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="http://127.0.0.1:3000/api/health"
STATE_FILE="/var/log/karaoq/error-spike.state"

if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
  rm -f "$STATE_FILE"
  exit 0
fi

if [ -f "$STATE_FILE" ]; then
  MESSAGE="karaoq: /api/health has failed twice in a row ($HEALTH_URL)"
  if [ -n "${NTFY_OPS_TOPIC:-}" ]; then
    if curl -fsS --max-time 5 -d "$MESSAGE" "https://ntfy.sh/$NTFY_OPS_TOPIC" > /dev/null 2>&1; then
      rm -f "$STATE_FILE"
    fi
    # Post failed: leave the state file so the next run retries the alert
    # immediately instead of waiting for another two-strikes count.
  else
    echo "$MESSAGE (NTFY_OPS_TOPIC unset, not paging)" >&2
    rm -f "$STATE_FILE"
  fi
else
  touch "$STATE_FILE"
fi
