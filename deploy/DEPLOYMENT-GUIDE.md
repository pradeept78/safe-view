# Safe View: Learn and Deploy

This guide teaches how Safe View gets from your Mac to the internet, and gives the steps to do it yourself.

Each lesson has four parts:

- **Understand it:** the idea in plain words
- **Do it:** the steps
- **You should see:** how to know it worked
- **Watch out:** the usual mistakes

Passwords and keys are never written here. Keep this repository private.

---

## Lesson 1: The big picture

### Understand it

Think of the app as a shop.

| Real life | Safe View | What it does |
|---|---|---|
| Your workshop | Your Mac | Where you build and try changes safely |
| A safe copy of the plans | GitHub | Stores every version of the code |
| The shop building | AWS server | Runs the app all day for customers |
| The shop's street address | Domain name | Lets people find the server |
| The security guard at the door | Caddy | Handles HTTPS and passes visitors to the app |
| Sealed, ready-to-run boxes | Docker | Runs the app the same way everywhere |
| The filing cabinet | Database | Holds bills, payments and users |

A change always travels the same road:

```text
Your Mac  ->  git push  ->  GitHub  ->  update command  ->  AWS server  ->  Customers
```

Your code travels along this road. Your data does not. Bills on AWS stay on AWS, and your Mac has its own
separate test data and passwords.

### Your details

| Item | Value |
|---|---|
| Website | https://safeviewglasssolutions.in/ |
| Dashboard | https://safeviewglasssolutions.in/admin/ |
| Code on your Mac | `/Users/Pradeep_1/Desktop/project/safe-view` |
| GitHub | https://github.com/pradeept78/safe-view (private) |
| AWS Lightsail | https://lightsail.aws.amazon.com/ (server `safe-view`, Sydney) |
| Server address | `15.135.34.182` |
| SSH key | `~/Downloads/LightsailDefaultKey-ap-southeast-2.pem` |
| Code on the server | `~/safe-view-docker` |
| Live data | `/var/lib/safe-view/safe-view.db` |
| Backups | `/var/lib/safe-view/backups` |
| Domain company | GoDaddy |

---

## Lesson 2: Try a change on your Mac

### Understand it

Never test on the live site. Run the app on your Mac first, where a mistake affects nobody.
`localhost` means "this computer", so that address only works on your Mac.

### Do it

1. Start the app:

```bash
cd /Users/Pradeep_1/Desktop/project/safe-view && npm start
```

2. Open http://localhost:4310/admin/ and try your change.
3. Press **Ctrl + C** in Terminal to stop it.

### You should see

`Safe View website: http://localhost:4310/` in Terminal, and the dashboard in your browser.

### Watch out

- `Missing script: "start"` means you are in the wrong folder.
- A "port in use" error means the app is already running, so just open the link.

---

## Lesson 3: Test before you publish

### Understand it

Tests are small programs that check the app still works, such as "is the bill total right?" and "can a
partner approve a bill?". They catch mistakes in seconds, before customers do.

### Do it

```bash
cd /Users/Pradeep_1/Desktop/project/safe-view && npm test
```

### You should see

`# fail 0` at the end.

### Watch out

If any test fails, stop and fix it. Never publish with a failing test.

---

## Lesson 4: Save your work with Git

### Understand it

Git works like save points in a game. Each **commit** is a save point with a note about what changed, and
you can go back to any of them. **Pushing** sends your save points to GitHub.

- `git status` shows what changed.
- `git add` chooses what to include.
- `git commit` creates the save point.
- `git push` uploads it to GitHub.

### Do it

1. See what changed:

```bash
git status
```

2. Choose everything:

```bash
git add -A
```

3. Save it with a short note about the change:

```bash
git commit -m "Describe your change"
```

4. Upload it:

```bash
git push origin main
```

### You should see

Your note at the top of https://github.com/pradeept78/safe-view

### Watch out

Look at `git status` before saving. Stop if you see a `.db`, `.sql`, `.pem`, `.env` or `.first-login.txt` file.
Those hold private data and must never go to GitHub.

---

## Lesson 5: Connect to your server

### Understand it

Your server is a computer in an AWS building, with no screen. **SSH** gives you a secure Terminal on it.
Your `.pem` key file proves you are allowed in, like a physical key. **Anyone with this file can enter
your server**, so treat it like a bank card.

When you connect, your Terminal is working on the server, not your Mac. The prompt changes to show it.

### Do it

```bash
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@15.135.34.182
```

Type `exit` to leave.

### You should see

A prompt like `ubuntu@ip-172-26-1-114`.

### Watch out

Always check the prompt before typing. Many mistakes come from running a command on the wrong computer.

---

## Lesson 6: Put your change live

### Understand it

GitHub has your new code, but the server does not fetch it by itself. The update command does four jobs:

1. Takes a backup, in case something goes wrong
2. Pulls the latest code from GitHub
3. Builds a new Docker box with that code
4. Swaps the old box for the new one

Your data lives outside the box, in `/var/lib/safe-view`, so replacing the box does not touch it. That is
one of the main reasons for using Docker.

### Do it

Connect to the server (Lesson 5), then run:

```bash
cd ~/safe-view-docker && sudo bash deploy/docker-update.sh
```

Then open https://safeviewglasssolutions.in/admin/ and check your change.

### You should see

`Update finished:` followed by the version code and your commit note.

### Watch out

- The site is down briefly, so avoid busy hours.
- Never edit code directly on the server. The next update can fail or overwrite it.
- If a page looks old, refresh it, or close and reopen the installed app.

---

## Lesson 7: Check the server is healthy

### Understand it

Docker runs two containers. `safe-view-app` is your app, and `safe-view-caddy` is the security guard.
**Logs** are the diary each one writes, and they are the first place to look when something breaks.

### Do it

Run these on the server, from `~/safe-view-docker`.

Is everything running?

```bash
sudo docker compose ps
```

Which version is live?

```bash
git log --oneline -1
```

App diary:

```bash
sudo docker compose logs --tail 50 app
```

Security guard diary, for HTTPS problems:

```bash
sudo docker compose logs --tail 50 caddy
```

Turn the app off and on again:

```bash
sudo docker compose restart app
```

Disk space and memory:

```bash
df -h / && free -m
```

### You should see

Both containers up, and the app marked `healthy`.

---

## Lesson 8: Backups, your safety net

### Understand it

A backup you have never tested may not save you. Safe View has two layers:

| Layer | When | Protects against |
|---|---|---|
| Nightly backup | 02:30 India time, kept 14 days | Mistakes and bad data |
| Lightsail snapshot | Daily, if turned on | Losing the whole server |

Nightly backups sit on the same server, so they are lost with it. That is why snapshots matter.

### Do it: run a backup now

```bash
cd ~/safe-view-docker && sudo docker compose exec -T app node scripts/backup.js
```

List backups:

```bash
sudo ls -lh /var/lib/safe-view/backups
```

### Do it: download a copy to your Mac

1. On the server:

```bash
sudo cp /var/lib/safe-view/backups/safe-view-$(date -u +%F).db ~/safe-view-copy.db && sudo chown ubuntu ~/safe-view-copy.db
```

2. In a new Terminal window on your Mac:

```bash
scp -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@15.135.34.182:safe-view-copy.db ~/Downloads/
```

3. Back on the server, remove the extra copy:

```bash
rm ~/safe-view-copy.db
```

### Do it: restore a backup

**This replaces all current data.** Change the date to the backup you want.

```bash
cd ~/safe-view-docker && sudo docker compose stop app
```

```bash
sudo cp /var/lib/safe-view/backups/safe-view-2026-11-07.db /var/lib/safe-view/safe-view.db
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

### Watch out

- Anything entered after the backup was made is lost when you restore.
- The `.db-wal` and `.db-shm` files hold recent changes, so they must be removed when restoring.
- Downloaded copies contain customer details. Delete them when you finish.

---

## Lesson 9: Undo a bad update

### Understand it

Because Git keeps every save point, you can send the server back to one that worked. This changes the code,
not your data.

### Do it

1. Take a backup (Lesson 8).
2. List recent versions:

```bash
cd ~/safe-view-docker && git log --oneline -10
```

3. Go back, using the short code from the list:

```bash
git checkout VERSION_CODE
```

```bash
sudo docker compose up -d --build
```

4. When the fix is pushed, return to the latest version:

```bash
git checkout main
```

```bash
sudo bash deploy/docker-update.sh
```

---

## Lesson 10: Getting back in

### Understand it

Passwords are stored as scrambled **hashes**, so nobody can read them, not even the admin. That is why you
reset a password instead of looking it up. Wrong passwords are limited to stop guessing, which is the
**Too many attempts** message.

### Do it

**If an admin can sign in:** open **Users**, then **Reset Password**.

**If nobody can sign in:** run this on the server, changing `admin` if that username was changed.

```bash
cd ~/safe-view-docker && sudo docker compose exec -T app node scripts/reset-password.js admin
```

**On your Mac:**

```bash
cd /Users/Pradeep_1/Desktop/project/safe-view && node scripts/reset-password.js admin
```

**Too many attempts:** wait 15 minutes, or run this on the server:

```bash
cd ~/safe-view-docker && sudo docker compose restart app
```

### You should see

A new password, shown once. Sign in, then change it under **My Account**.

---

## Lesson 11: Look at your data

### Understand it

A **database** stores information in tables, like spreadsheets. Safe View uses **SQLite**, which keeps it all
in one file. **SQL** is the language for asking it questions. Read-only mode means you cannot change anything
by accident.

Never edit the live database by hand. Totals and bill numbers depend on each other.

### Do it

On your Mac:

```bash
sqlite3 -readonly -header -column /Users/Pradeep_1/Desktop/project/safe-view/data/safe-view.db
```

On the server, after installing the viewer once with `sudo apt-get install -y sqlite3`:

```bash
sudo sqlite3 -readonly -header -column /var/lib/safe-view/safe-view.db
```

Then try these at the `sqlite>` prompt:

```sql
.tables
```

```sql
SELECT number, customer_name, status, quote_status FROM bills ORDER BY id DESC LIMIT 20;
```

```sql
.quit
```

**For MySQL Workbench:** create an import file, then use **Server**, **Data Import**,
**Import from Self-Contained File**. It is a separate copy, and changes there do not reach the app.

```bash
cd /Users/Pradeep_1/Desktop/project/safe-view && node scripts/export-mysql.js
```

---

## Lesson 12: Domains and HTTPS

### Understand it

Computers find each other by number, like `15.135.34.182`. **DNS** is the phone book that turns your domain
into that number. An **A record** is one phone book entry.

**HTTPS** encrypts everything between the visitor and the server, and gives you the padlock. Caddy gets a
free certificate from Let's Encrypt and renews it by itself.

### Do it: point a domain at a server

In GoDaddy DNS, set:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `15.135.34.182` | 600 seconds |

Leave the `www` CNAME, `NS`, `SOA` and other records alone.

Check it from your Mac:

```bash
dig +short safeviewglasssolutions.in
```

### Do it: tell the server about a new domain

Run this once, after DNS shows the right number:

```bash
cd ~/safe-view-docker && sudo bash deploy/docker-setup.sh yourdomain.in
```

### Watch out

- DNS changes can take minutes to hours to reach everyone.
- A brief SSL error just after a restart is normal. Wait a minute, then try a private window.
- Do not repeat the setup command. Certificate requests have limits.
- Installed phone apps must be reinstalled after changing the domain.

---

## Lesson 13: Build a new server

### Understand it

Your code is on GitHub and your data is in backups, so a server can be replaced. Practise this before you
need it. It is also how you would move to Mumbai.

### Do it

1. In Lightsail, create an **Ubuntu 24.04** server with at least 1 GB of memory.
2. Attach a **static IP**. It keeps the address fixed.
3. Open ports **22, 80 and 443**. Do not open port 4310.
4. Turn on **Automatic snapshots**.
5. Download the SSH key for that region, then connect (Lesson 5).
6. Install updates, then restart the server:

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo reboot
```

7. Reconnect and make a key so the server can read GitHub:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_safe_view -N "" -C safe-view-server
```

```bash
cat ~/.ssh/github_safe_view.pub
```

8. Add that line at https://github.com/pradeept78/safe-view/settings/keys using **Add deploy key**.
   Leave **Allow write access** off, so the server can only read.
9. Download the code:

```bash
git clone -c core.sshCommand="ssh -i ~/.ssh/github_safe_view -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git@github.com:pradeept78/safe-view.git ~/safe-view-docker
```

10. Point your domain at the new static IP (Lesson 12), and wait until `dig` shows it.
11. Install and start:

```bash
cd ~/safe-view-docker && sudo bash deploy/docker-setup.sh safeviewglasssolutions.in
```

12. Bring your data across with **Restore a backup** (Lesson 8).
13. If you started with empty data, read the first logins, change each password, then delete the file:

```bash
sudo cat /var/lib/safe-view/first-login.txt
```

```bash
sudo rm /var/lib/safe-view/first-login.txt
```

---

## Quick reference

### The normal routine

| Step | Where | Command |
|---|---|---|
| 1. Try it | Mac | `npm start` |
| 2. Test it | Mac | `npm test` |
| 3. Check files | Mac | `git status` |
| 4. Save it | Mac | `git add -A` then `git commit -m "Note"` |
| 5. Upload it | Mac | `git push origin main` |
| 6. Connect | Mac | `ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@15.135.34.182` |
| 7. Update | Server | `cd ~/safe-view-docker && sudo bash deploy/docker-update.sh` |
| 8. Check it | Browser | https://safeviewglasssolutions.in/admin/ |

### When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `Missing script: "start"` | Wrong folder | Go to the `safe-view` folder |
| Port 4310 already in use | App already running | Open the link |
| SSL error after a restart | HTTPS still starting | Wait a minute, try a private window |
| Too many attempts | Sign-in limit reached | Lesson 10 |
| Update stops at `git pull` | Code on the server was changed | Run `git status` on the server |
| Site down after an update | The new version has a problem | Lessons 7 and 9 |
| Old design showing | Browser kept an old copy | Refresh, or reopen the app |
| Disk nearly full | Old Docker files | `sudo docker system prune -f` |

### Regular care

**Every month**
- Check that Lightsail snapshots exist.
- Check that backups are appearing, and that disk space is fine.
- Install Ubuntu updates at a quiet time, then reboot:

```bash
sudo apt update && sudo apt upgrade -y
```

**Every year**
- Renew the domain, or keep auto-renew on.
- Practise restoring a backup on your Mac.

### Keep these safe

Never put these in Git, chat or screenshots:

- Dashboard, AWS, GoDaddy and GitHub passwords
- The `.pem` SSH key and MFA codes
- Database and `.sql` export files
- Bank and card details

Use a password manager, and keep a safe copy of the SSH key outside Downloads.

### Words to know

| Word | Meaning |
|---|---|
| Commit | A save point in Git |
| Push | Upload save points to GitHub |
| Pull | Download the latest code |
| Branch | A separate line of work |
| SSH | A secure Terminal on another computer |
| Docker container | A sealed box running the app |
| Caddy | The program that handles HTTPS |
| DNS | The internet's phone book |
| A record | A DNS entry pointing a name at a number |
| Static IP | A server address that does not change |
| Snapshot | A full copy of the whole server |
| Hash | A scrambled password that cannot be read back |
| Port | A numbered door on a server |
