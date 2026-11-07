# Safe View Glass Solutions

Customer website and billing dashboard.

## Run it

```bash
npm install
npm start
```

- Website: http://localhost:4310/
- Dashboard: http://localhost:4310/admin/

The first start creates three logins (`admin`, `partner2`, `partner3`) and saves them in
`.first-login.txt`. Sign in, change each password under My Account, then delete that file.

## Before real use

1. As admin, fill in Settings: address, GST number, phone, WhatsApp, email, bank details, jurisdiction.
2. Fill in Materials & Rates once: name, HSN, thickness, rate and GST. The one material there comes from the sample bill.
3. Review the terms in Settings. They come from the sample bill.

## Users

The admin adds people, edits names, usernames and roles, resets passwords and turns off access on the Users page.
Users are turned off rather than deleted, because their names stay on past bills.

## Installing on a phone

The dashboard can be installed as an app. It needs HTTPS, so use the live site, not the Wi-Fi address.

- Android, in Chrome: open the dashboard, then More, then Install App.
- iPhone, in Safari: tap Share, then Add to Home Screen.

The app needs the internet. Only design files are kept on the phone, never bills or customer details.
When sw.js changes, raise its CACHE version so phones replace their saved files.

## If nobody can sign in

On your Mac:

```bash
node scripts/reset-password.js admin
```

On the server, from `~/safe-view-docker`:

```bash
sudo docker compose exec -T app node scripts/reset-password.js admin
```

It shows a new password once. Sign in and change it under My Account.

## Enquiry alerts and the activity log

New enquiries show a red count in the dashboard. Email alerts are optional: add the SMTP settings from
`.env.example` to the server's `.env`, then run `sudo docker compose up -d`.

The Activity page shows the admin who did what. It records actions, never passwords.

## How billing works

- Anyone signed in can create a draft. Partners send it for approval.
- Only the admin can approve or send a bill back. The admin's own drafts can be approved directly.
- The bill number is given at approval, so numbers never skip.
- Approved bills are locked and keep the business details they were approved with.
- Only approved bills can be printed.

## Correcting bills and tax invoices

- Revise Bill makes an editable copy of an approved bill. The old bill stays valid until the copy is approved.
- When it is approved, the order, payments and vendor costs move to the new bill. A bill can be revised as often as needed.
- Old versions leave the normal lists. They show under the Revised filter and in each bill's version history.
- The admin creates a tax invoice from a won order. Numbers look like SV/26-27/00001 and restart each financial year.
- A tax invoice locks the order. Have your accountant confirm the format before using it.

## Overview

The Overview page shows total sales, profit and investment, with monthly graphs. Sales and profit leave out GST.
Confirmed profit comes from completed projects. Expected profit comes from projects still in progress.

## How money tracking works

- An approved bill is a quotation waiting for the customer. Mark it as won with the order date, or lost with a reason.
- Only won quotations become projects. Add customer part payments and project costs to them.
- The Quotations page shows how many were sent, won and lost, the win rate, why orders were lost, and follow-ups.
- Add each cost with its type (glass, installation, transport, hardware or other) and total amount, then mark the project as completed. Costs count even before they are paid.
- A project page has three tabs: Summary, Customer payments and Costs.
- The Projects list can be filtered to in progress, money to collect, costs to pay or completed.
- Pay a cost in parts. Each payment reduces that cost's balance, and paying more than the balance is refused.
- Profit is the order value before GST, minus project costs. It is expected until completed, then confirmed.
- Shop expenses are not taken off a project. Overview shows confirmed profit after shop expenses.
- The dashboard has dark and light themes. Dark is the default. Switch with the sun or moon button beside Sign out, or More on a phone, and each device remembers its choice.
- Settings has Business, Bank and Bills tabs that save together. GST number, IFSC, WhatsApp, email, GST % and allowance are checked before saving.
- Quick add, in the sidebar or top bar, records payments, costs, expenses and investment from any page.
- Add buttons on each page open the same popup, already set to that project or cost.
- Monthly Accounts shows cash and online money in, vendor payments and shop expenses for a month.
- Investment shows who put in how much, and what it paid for.
- Partners can add entries. Only the admin can delete them.

## Going live

Follow [deploy/DEPLOYMENT-GUIDE.md](deploy/DEPLOYMENT-GUIDE.md). It teaches each step, from your Mac to the live site.

## Viewing data in MySQL Workbench

The app uses SQLite. To browse a copy in MySQL Workbench, create an import file:

```bash
node scripts/export-mysql.js
```

Import `data/safe-view-mysql.sql` in Workbench. It creates a separate `safe_view_copy` database.
Changes made there do not reach the app. Password hashes and sign-in sessions are left out.

## Tests

```bash
npm test
```
