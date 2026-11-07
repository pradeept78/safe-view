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

## How billing works

- Anyone signed in can create a draft. Partners send it for approval.
- Only the admin can approve or send a bill back. The admin's own drafts can be approved directly.
- The bill number is given at approval, so numbers never skip.
- Approved bills are locked and keep the business details they were approved with.
- Only approved bills can be printed.

## Going live

Follow [deploy/AWS-SETUP.md](deploy/AWS-SETUP.md). It covers the server, HTTPS, backups and updates.

## Tests

```bash
npm test
```
