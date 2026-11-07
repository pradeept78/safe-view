#!/usr/bin/env bash
# Installs a newer upload of the app, keeping all saved data. Run from the uploaded folder:
#   sudo bash deploy/update-server.sh
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run this with sudo." >&2
  exit 1
fi

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/safe-view

echo "==> Backing up first"
systemctl start safe-view-backup.service

echo "==> Installing the update"
rsync -a --delete --exclude node_modules --exclude data --exclude backups --exclude .first-login.txt "$SOURCE/" "$APP_DIR/"
cd "$APP_DIR"
npm ci --omit=dev
systemctl restart safe-view.service

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:4310/api/health >/dev/null; then
    echo "Update finished."
    exit 0
  fi
  sleep 1
done

echo "The app did not start. Check it with: sudo journalctl -u safe-view -n 50" >&2
exit 1
