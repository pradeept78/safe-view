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

The admin adds people, edits names and roles, resets passwords and turns off access on the Users page.
Users are turned off rather than deleted, because their names stay on past bills.

## How billing works

- Anyone signed in can create a draft. Partners send it for approval.
- Only the admin can approve or send a bill back. The admin's own drafts can be approved directly.
- The bill number is given at approval, so numbers never skip.
- Approved bills are locked and keep the business details they were approved with.
- Only approved bills can be printed.

## How money tracking works

- An approved bill is a quotation waiting for the customer. Mark it as won with the order date, or lost with a reason.
- Only won quotations become projects. Add part payments and vendor payments to them.
- The Quotations page shows how many were sent, won and lost, the win rate, why orders were lost, and follow-ups.
- Profit is the order value before GST, minus vendor payments. Shop expenses are not taken off a project.
- Monthly Accounts shows cash and online money in, vendor payments and shop expenses for a month.
- Investment shows who put in how much, and what it paid for.
- Partners can add entries. Only the admin can delete them.

## Going live

Follow [deploy/AWS-SETUP.md](deploy/AWS-SETUP.md). It covers the server, HTTPS, backups and updates.

## Tests

```bash
npm test
```
