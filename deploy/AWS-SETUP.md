# Put Safe View on AWS

This puts the website and dashboard on one AWS Lightsail server with HTTPS and nightly backups.
Set aside about an hour. Domain changes can take longer to reach everyone.

## What you need first

- An AWS account with a payment method.
- A domain name you own, like `yourdomain.in`. HTTPS and sign-in will not work on a bare IP address.

## 1. Create the server

1. Open the Lightsail console and choose **Create instance**.
2. Region: **Mumbai (ap-south-1)**.
3. Platform: **Linux/Unix**. Blueprint: **OS Only**, then **Ubuntu 24.04 LTS**.
4. Download the SSH key when offered and keep it safe. Anyone with this file can get into the server.
5. Plan: choose one with at least **1 GB** memory. Check the price shown before creating it.
6. Name it `safe-view` and choose **Create instance**.

## 2. Give it a fixed address and open the ports

1. Go to **Networking** and create a **static IP** attached to `safe-view`. Note this address.
2. On the instance's **Networking** tab, keep **SSH (22)** and **HTTP (80)**, and add **HTTPS (443)**.
3. Do not open port 4310.

## 3. Turn on automatic snapshots

On the instance's **Snapshots** tab, turn on **Automatic snapshots**. Snapshots are stored apart from
the server, so they protect you if the whole server is lost. They have a small extra cost.

## 4. Point your domain at the server

At your domain company, add these DNS records, using your static IP:

| Type | Name | Value |
|------|------|-------|
| A | `@` | your static IP |
| A | `www` | your static IP |

Wait until the check below shows your static IP:

```bash
dig +short yourdomain.in
```

## 5. Upload the app

On your Mac, from the `safe-view` folder:

```bash
bash deploy/upload.sh ~/Downloads/YOUR-KEY.pem YOUR_STATIC_IP
```

## 6. Install it

Connect to the server:

```bash
ssh -i ~/Downloads/YOUR-KEY.pem ubuntu@YOUR_STATIC_IP
```

Then, on the server:

```bash
cd ~/safe-view && sudo bash deploy/setup-server.sh yourdomain.in
```

Show your three first logins:

```bash
sudo cat /var/lib/safe-view/first-login.txt
```

## 7. Finish setting up

1. Open `https://yourdomain.in/` and check for the padlock.
2. Sign in at `https://yourdomain.in/admin/` with each login and change its password under My Account.
3. Delete the logins file on the server:

```bash
sudo rm /var/lib/safe-view/first-login.txt
```

4. As admin, fill in **Settings** and **Materials & Rates**.
5. Send a test enquiry and make one test bill.

The server starts with an empty database. Nothing from your Mac is copied across.

## Updating the app later

Upload again with step 5, then on the server:

```bash
cd ~/safe-view && sudo bash deploy/update-server.sh
```

The update takes a backup first and keeps all your data.

## Useful checks

Is the app running?

```bash
sudo systemctl status safe-view
```

Show recent errors:

```bash
sudo journalctl -u safe-view -n 50
```

Run a backup now:

```bash
sudo systemctl start safe-view-backup.service
```

List backups:

```bash
sudo ls -lh /var/lib/safe-view/backups
```

## Restoring a backup

Replace the date with the backup you want. This replaces all current data, so only do it when you are sure.

```bash
sudo systemctl stop safe-view
```

```bash
sudo cp /var/lib/safe-view/backups/safe-view-2026-11-06.db /var/lib/safe-view/safe-view.db
```

```bash
sudo rm -f /var/lib/safe-view/safe-view.db-wal /var/lib/safe-view/safe-view.db-shm
```

```bash
sudo chown safeview:safeview /var/lib/safe-view/safe-view.db
```

```bash
sudo systemctl start safe-view
```
