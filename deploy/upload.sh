#!/usr/bin/env bash
# Copies the app from this Mac to the server, leaving out local data and passwords. Run from the safe-view folder:
#   bash deploy/upload.sh ~/Downloads/lightsail-key.pem 13.0.0.1
set -euo pipefail

KEY="${1:-}"
SERVER_IP="${2:-}"
if [[ -z "$KEY" || -z "$SERVER_IP" ]]; then
  echo "Usage: bash deploy/upload.sh path/to/lightsail-key.pem SERVER_IP" >&2
  exit 1
fi

chmod 600 "$KEY"
rsync -az --delete -e "ssh -i $KEY" \
  --exclude node_modules --exclude data --exclude backups --exclude .first-login.txt --exclude .git \
  "$(cd "$(dirname "$0")/.." && pwd)/" "ubuntu@$SERVER_IP:safe-view/"
echo "Uploaded to the server's safe-view folder."
