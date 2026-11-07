# Run Safe View on AWS with Docker

The server pulls the code from GitHub and runs it in two containers: the app, and Caddy for HTTPS.
All data stays in `/var/lib/safe-view` on the server, outside the containers.

## What you need first

- A Lightsail server running Ubuntu 24.04, with ports 22, 80 and 443 open and a static IP.
- Automatic snapshots turned on, so you are protected if the whole server is lost.
- A domain pointing at the static IP. Sign-in needs HTTPS, so a bare IP address will not work.

## First-time setup

Connect to the server:

```bash
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@15.135.34.182
```

### 1. Create a key so the server can read GitHub

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_safe_view -N "" -C safe-view-server
```

```bash
cat ~/.ssh/github_safe_view.pub
```

Copy the line it prints. This is the public half, so it is safe to paste into GitHub.

### 2. Add the key to GitHub

1. Open https://github.com/pradeept78/safe-view/settings/keys
2. Choose **Add deploy key**.
3. Title: `safe-view-server`. Paste the line into **Key**.
4. Leave **Allow write access** off, so the server can only read.
5. Choose **Add key**.

### 3. Download the code

```bash
git clone -c core.sshCommand="ssh -i ~/.ssh/github_safe_view -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git@github.com:pradeept78/safe-view.git ~/safe-view-docker
```

### 4. Install and start

Use your domain. If an older install is running, this backs it up, stops it and keeps its data.

```bash
cd ~/safe-view-docker && sudo bash deploy/docker-setup.sh yourdomain.in
```

### 5. Check it

```bash
sudo docker compose ps
```

Both containers should show as running, and the app as healthy. Then open your site and check for the padlock.

On a brand new server, the first logins are here. Change each password under My Account, then delete the file.

```bash
sudo cat /var/lib/safe-view/first-login.txt
```

```bash
sudo rm /var/lib/safe-view/first-login.txt
```

## Getting the latest code

On your Mac, commit and push to `main`. Then on the server:

```bash
cd ~/safe-view-docker && sudo bash deploy/docker-update.sh
```

This takes a backup, pulls the code, rebuilds and restarts. Your data is kept.
The site is briefly unavailable while it restarts.

## Changing the domain

Run the install step again with the new domain. It keeps your data.

```bash
cd ~/safe-view-docker && sudo bash deploy/docker-setup.sh safeviewglasssolutions.in
```

## Useful checks

Run these from `~/safe-view-docker`.

See the containers:

```bash
sudo docker compose ps
```

Show recent app errors:

```bash
sudo docker compose logs --tail 50 app
```

Show HTTPS problems:

```bash
sudo docker compose logs --tail 50 caddy
```

Run a backup now:

```bash
sudo docker compose exec -T app node scripts/backup.js
```

List backups:

```bash
sudo ls -lh /var/lib/safe-view/backups
```

Backups run every night at 02:30 India time and are kept for 14 days.

## Restoring a backup

Replace the date with the backup you want. This replaces all current data, so only do it when you are sure.

```bash
sudo docker compose stop app
```

```bash
sudo cp /var/lib/safe-view/backups/safe-view-2026-11-06.db /var/lib/safe-view/safe-view.db
```

```bash
sudo rm -f /var/lib/safe-view/safe-view.db-wal /var/lib/safe-view/safe-view.db-shm
```

```bash
sudo chown 1000:1000 /var/lib/safe-view/safe-view.db
```

```bash
sudo docker compose start app
```
