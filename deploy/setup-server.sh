#!/usr/bin/env bash
# First-time setup for a new Ubuntu 24.04 server. Run from the uploaded app folder:
#   sudo bash deploy/setup-server.sh yourdomain.in
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash deploy/setup-server.sh yourdomain.in" >&2
  exit 1
fi
if [[ ! "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "That does not look like a domain name. Leave out https:// and www." >&2
  exit 1
fi
if [[ "$EUID" -ne 0 ]]; then
  echo "Please run this with sudo." >&2
  exit 1
fi

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/safe-view
DATA_DIR=/var/lib/safe-view

echo "==> Installing Node.js, Caddy and build tools"
apt-get update
apt-get install -y curl gnupg rsync build-essential python3 debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> Creating the app user and folders"
id safeview >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin safeview
mkdir -p "$APP_DIR" "$DATA_DIR/backups"
chown -R safeview:safeview "$DATA_DIR"
chmod 700 "$DATA_DIR"

if [[ ! -f /etc/safe-view.env ]]; then
  cat > /etc/safe-view.env <<ENV
NODE_ENV=production
PORT=4310
DB_FILE=$DATA_DIR/safe-view.db
FIRST_LOGIN_FILE=$DATA_DIR/first-login.txt
BACKUP_DIR=$DATA_DIR/backups
BACKUP_KEEP_DAYS=14
ENV
  chmod 640 /etc/safe-view.env
  chown root:safeview /etc/safe-view.env
fi

echo "==> Installing the app"
rsync -a --delete --exclude node_modules --exclude data --exclude backups --exclude .first-login.txt "$SOURCE/" "$APP_DIR/"
cd "$APP_DIR"
npm ci --omit=dev

echo "==> Setting up HTTPS for $DOMAIN"
sed "s/__DOMAIN__/$DOMAIN/g" deploy/Caddyfile.template > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "==> Starting everything"
cp deploy/safe-view.service deploy/safe-view-backup.service deploy/safe-view-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now safe-view.service safe-view-backup.timer
systemctl reload caddy || systemctl restart caddy

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:4310/api/health >/dev/null; then
    echo
    echo "Done. Open https://$DOMAIN/"
    echo "First logins are in $DATA_DIR/first-login.txt. See them with:"
    echo "  sudo cat $DATA_DIR/first-login.txt"
    exit 0
  fi
  sleep 1
done

echo "The app did not start. Check it with: sudo journalctl -u safe-view -n 50" >&2
exit 1
