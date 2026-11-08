#!/usr/bin/env bash
# Copies the server's nightly backups to this Mac, so losing the server never means losing the data.
# Run it from your Mac (not on the server), from the safe-view folder:
#   bash scripts/pull-backups.sh
# It only reads from the server. Settings can be changed with these variables:
#   SAFEVIEW_KEY      the SSH key       (default: ~/Downloads/safeview.pem)
#   SAFEVIEW_HOST     the server        (default: ubuntu@15.135.34.182)
#   SAFEVIEW_BACKUPS  where to save     (default: ~/Documents/SafeView-Backups)
set -euo pipefail

KEY="${SAFEVIEW_KEY:-$HOME/Downloads/safeview.pem}"
HOST="${SAFEVIEW_HOST:-ubuntu@15.135.34.182}"
DEST="${SAFEVIEW_BACKUPS:-$HOME/Documents/SafeView-Backups}"
SOURCE="${SAFEVIEW_SOURCE:-/var/lib/safe-view/backups}"

if [[ ! -f "$KEY" ]]; then
  echo "SSH key not found: $KEY" >&2
  echo "Set SAFEVIEW_KEY to where your safeview.pem file is." >&2
  exit 1
fi

mkdir -p "$DEST"
before=$(find "$DEST" -name 'safe-view-*.db' | wc -l | tr -d ' ')

echo "==> Copying backups from $HOST"
# The backups belong to root on the server, so they are packed with sudo and unpacked here.
ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" "sudo sh -c 'cd $SOURCE && tar -cf - safe-view-*.db'" | tar -C "$DEST" -xf -

after=$(find "$DEST" -name 'safe-view-*.db' | wc -l | tr -d ' ')
newest=$(find "$DEST" -name 'safe-view-*.db' | sort | tail -1)
if [[ -z "$newest" ]]; then
  echo "No backups were found on the server. Check that the nightly backup is running." >&2
  exit 1
fi

# A backup is only useful if it opens, so check the newest one.
if command -v sqlite3 >/dev/null; then
  check=$(sqlite3 "$newest" 'PRAGMA integrity_check;' 2>&1 | head -1 || true)
  bills=$(sqlite3 "$newest" 'SELECT COUNT(*) FROM bills;' 2>/dev/null || echo '?')
  if [[ "$check" != "ok" ]]; then
    echo "The newest backup did not pass its check: $check" >&2
    exit 1
  fi
  echo "==> Newest backup checked: $(basename "$newest"), $bills bills inside"
fi

echo "Done. $((after - before)) new, $after backups in $DEST"
