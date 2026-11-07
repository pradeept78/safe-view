#!/usr/bin/env bash
# Pulls the latest code from GitHub and restarts it, keeping all data. From the repository:
#   sudo bash deploy/docker-update.sh
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run this with sudo." >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

echo "==> Backing up first"
docker compose exec -T app node scripts/backup.js

echo "==> Pulling the latest code"
sudo -H -u "${SUDO_USER:-ubuntu}" git pull --ff-only origin main

echo "==> Rebuilding and restarting"
docker compose up -d --build
docker image prune -f >/dev/null

for attempt in $(seq 1 30); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' safe-view-app)" == "healthy" ]]; then
    echo "Update finished: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 2
done

echo "The app did not start. Check it with: sudo docker compose logs app" >&2
exit 1
