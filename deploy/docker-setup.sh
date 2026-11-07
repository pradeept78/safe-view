#!/usr/bin/env bash
# One-time setup on the server, from the cloned repository:
#   sudo bash deploy/docker-setup.sh yourdomain.in
# Moves an existing install across, keeping its data.
set -euo pipefail

DOMAIN="${1:-}"
if [[ ! "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "Usage: sudo bash deploy/docker-setup.sh yourdomain.in  (leave out https:// and www)" >&2
  exit 1
fi
if [[ "$EUID" -ne 0 ]]; then
  echo "Please run this with sudo." >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR=/var/lib/safe-view
cd "$REPO"

if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

if [[ ! -f /swapfile ]]; then
  echo "==> Adding 1 GB of swap, as a safety margin on a small server"
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if systemctl is-active --quiet safe-view; then
  echo "==> Backing up, then stopping the old install"
  systemctl start safe-view-backup.service
  systemctl disable --now safe-view.service safe-view-backup.timer
fi
if systemctl is-active --quiet caddy; then
  systemctl disable --now caddy
fi

echo "==> Preparing the data folder"
mkdir -p "$DATA_DIR/backups"
chown -R 1000:1000 "$DATA_DIR"
chmod 700 "$DATA_DIR"

printf 'DOMAIN=%s\nDATA_DIR=%s\n' "$DOMAIN" "$DATA_DIR" > .env
chmod 600 .env

echo "==> Building and starting"
docker compose up -d --build

cat > /etc/cron.d/safe-view-backup <<CRON
# Every night at 21:00 UTC, which is 02:30 in India.
0 21 * * * root cd $REPO && /usr/bin/docker compose exec -T app node scripts/backup.js >> /var/log/safe-view-backup.log 2>&1
CRON

for attempt in $(seq 1 30); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' safe-view-app)" == "healthy" ]]; then
    echo
    echo "Done. Open https://$DOMAIN/"
    exit 0
  fi
  sleep 2
done

echo "The app did not start. Check it with: sudo docker compose logs app" >&2
exit 1
