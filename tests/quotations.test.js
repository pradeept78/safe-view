const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'test-password-1';
let server;
let base;
let db;

test.before(async () => {
  db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  await new Promise((resolve) => { server = createApp(db, { limits: { login: 1000, enquiry: 1000 } }).listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function call(cookie, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function login(username) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

// Charged as exactly 1 sq m, so the value before GST equals the rate.
const line = (rate) => ({ glassName: 'GLASS', hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty: 1, rate, gstPercent: 18 });

async function quotation(admin, rate = 10000, customerName = 'Quote Customer') {
  const { body } = await call(admin, 'POST', '/api/bills', { customerName, lines: [line(rate)] });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  return body.id;
}

const onProjects = async (cookie, id) => (await call(cookie, 'GET', '/api/projects')).body.some((p) => p.id === id);

test('an approved bill waits for the customer and is not a project yet', async () => {
  const admin = await login('admin');
  const id = await quotation(admin);
  assert.equal((await call(admin, 'GET', `/api/bills/${id}`)).body.quoteStatus, 'waiting');
  assert.equal(await onProjects(admin, id), false);
  assert.equal((await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-01', amount: 10, method: 'cash' })).status, 404);
});

test('winning needs a date and turns the quotation into a project', async () => {
  const admin = await login('admin');
  const id = await quotation(admin);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/won`, {})).status, 400);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/won`, { acceptedOn: '2026-10-05' })).status, 200);
  assert.equal(await onProjects(admin, id), true);
  assert.equal((await call(admin, 'GET', `/api/projects/${id}`)).body.acceptedOn, '2026-10-05');
  assert.equal((await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-06', amount: 10, method: 'cash' })).status, 201);
});

test('losing needs a known reason and keeps it out of projects', async () => {
  const admin = await login('admin');
  const id = await quotation(admin);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/lost`, {})).status, 400);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/lost`, { reason: 'Bad luck' })).status, 400);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/lost`, { reason: 'Other' })).status, 400);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/lost`, { reason: 'Price too high', note: 'Competitor at 620' })).status, 200);
  const bill = (await call(admin, 'GET', `/api/bills/${id}`)).body;
  assert.equal(bill.quoteStatus, 'lost');
  assert.equal(bill.lostReason, 'Price too high');
  assert.equal(bill.lostNote, 'Competitor at 620');
  assert.equal(await onProjects(admin, id), false);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/won`, { acceptedOn: '2026-10-05' })).status, 409);
});

test('a lost quotation can be reopened and then won', async () => {
  const admin = await login('admin');
  const id = await quotation(admin);
  await call(admin, 'PUT', `/api/quotations/${id}/lost`, { reason: 'Project postponed' });
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/reopen`)).status, 200);
  const bill = (await call(admin, 'GET', `/api/bills/${id}`)).body;
  assert.equal(bill.quoteStatus, 'waiting');
  assert.equal(bill.lostReason, '');
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/won`, { acceptedOn: '2026-10-05' })).status, 200);
});

test('a won quotation with money recorded cannot be reopened', async () => {
  const admin = await login('admin');
  const id = await quotation(admin);
  await call(admin, 'PUT', `/api/quotations/${id}/won`, { acceptedOn: '2026-10-05' });
  const payment = await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-06', amount: 10, method: 'cash' });
  const blocked = await call(admin, 'PUT', `/api/quotations/${id}/reopen`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /payment/i);
  await call(admin, 'DELETE', `/api/payments/${payment.body.id}`);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/reopen`)).status, 200);
  assert.equal(await onProjects(admin, id), false);
  assert.equal((await call(admin, 'GET', `/api/bills/${id}`)).body.acceptedOn ?? null, null);
});

test('drafts and bills waiting for the admin have no customer decision', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/bills', { customerName: 'Draft', lines: [line(100)] });
  assert.equal((await call(admin, 'PUT', `/api/quotations/${body.id}/won`, { acceptedOn: '2026-10-05' })).status, 404);
});

test('the report counts results, win rate, values and reasons for the chosen dates', async () => {
  const admin = await login('admin');
  const before = (await call(admin, 'GET', '/api/quotations?from=2000-01-01&to=2100-01-01')).body;
  const won = await quotation(admin, 1000);
  const lostOne = await quotation(admin, 2000);
  const lostTwo = await quotation(admin, 3000);
  const lostThree = await quotation(admin, 500);
  await quotation(admin, 4000);
  await call(admin, 'PUT', `/api/quotations/${won}/won`, { acceptedOn: '2026-10-05' });
  await call(admin, 'PUT', `/api/quotations/${lostOne}/lost`, { reason: 'Price too high' });
  await call(admin, 'PUT', `/api/quotations/${lostTwo}/lost`, { reason: 'Price too high' });
  await call(admin, 'PUT', `/api/quotations/${lostThree}/lost`, { reason: 'Chose another vendor' });

  const { body } = await call(admin, 'GET', '/api/quotations?from=2000-01-01&to=2100-01-01');
  assert.equal(body.sent - before.sent, 5);
  assert.equal(body.won - before.won, 1);
  assert.equal(body.lost - before.lost, 3);
  assert.equal(body.waiting - before.waiting, 1);
  assert.equal(body.valueLost - before.valueLost, 5500);
  assert.equal(body.valueWon - before.valueWon, 1000);
  assert.equal(body.winRate, Math.round((body.won / (body.won + body.lost)) * 100));
  const price = body.lostReasons.find((r) => r.reason === 'Price too high');
  assert.ok(price.count >= 2);
  assert.ok(body.reasons.includes('Customer stopped responding'));

  const empty = (await call(admin, 'GET', '/api/quotations?from=1999-01-01&to=1999-12-31')).body;
  assert.equal(empty.sent, 0);
  assert.equal(empty.winRate, null);
  assert.equal((await call(admin, 'GET', '/api/quotations?from=bad&to=2100-01-01')).status, 400);
});

test('follow-ups list waiting quotations by date and drop off once decided', async () => {
  const admin = await login('admin');
  const later = await quotation(admin, 100, 'Later');
  const sooner = await quotation(admin, 100, 'Sooner');
  await call(admin, 'PUT', `/api/quotations/${later}/follow-up`, { followUpOn: '2026-12-20' });
  await call(admin, 'PUT', `/api/quotations/${sooner}/follow-up`, { followUpOn: '2026-12-10' });
  let { body } = await call(admin, 'GET', '/api/quotations?from=2000-01-01&to=2100-01-01');
  const order = body.followUps.map((f) => f.id);
  assert.ok(order.indexOf(sooner) < order.indexOf(later));
  await call(admin, 'PUT', `/api/quotations/${sooner}/lost`, { reason: 'Customer stopped responding' });
  ({ body } = await call(admin, 'GET', '/api/quotations?from=2000-01-01&to=2100-01-01'));
  assert.equal(body.followUps.some((f) => f.id === sooner), false);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${later}/follow-up`, { followUpOn: 'soon' })).status, 400);
});

test('quotation pages need a login, and partners can record decisions', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  const id = await quotation(admin);
  assert.equal((await call(null, 'GET', '/api/quotations?from=2000-01-01&to=2100-01-01')).status, 401);
  assert.equal((await call(null, 'PUT', `/api/quotations/${id}/lost`, { reason: 'Price too high' })).status, 401);
  assert.equal((await call(partner, 'PUT', `/api/quotations/${id}/won`, { acceptedOn: '2026-10-05' })).status, 200);
});

test('existing bills with an order date or money become won, the rest wait', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-quote-'));
  const file = path.join(dir, 'old.db');
  const first = openDatabase(file);
  const insert = first.prepare(`INSERT INTO bills (status, customer_name, allowance_mm, gst_percent, lines_json, totals_json, prepared_by, created_at, updated_at, order_accepted_on, approved_at)
    VALUES (?, ?, 50, 18, '[]', '{}', 1, 'now', 'now', ?, 'now')`);
  const dated = insert.run('approved', 'Dated', '2026-10-01').lastInsertRowid;
  const paid = insert.run('approved', 'Paid', null).lastInsertRowid;
  const plain = insert.run('approved', 'Plain', null).lastInsertRowid;
  const draft = insert.run('draft', 'Draft', null).lastInsertRowid;
  first.prepare("INSERT INTO payments (bill_id, date, amount, method, created_by, created_at) VALUES (?, '2026-10-02', 10, 'cash', 1, 'now')").run(paid);
  first.exec('ALTER TABLE bills DROP COLUMN quote_status');
  first.close();

  const upgraded = new Database(file);
  upgraded.close();
  const db2 = openDatabase(file);
  const status = (id) => db2.prepare('SELECT quote_status FROM bills WHERE id = ?').get(id).quote_status;
  assert.equal(status(dated), 'won');
  assert.equal(status(paid), 'won');
  assert.equal(status(plain), 'waiting');
  assert.equal(status(draft), 'waiting');
  db2.close();
  fs.rmSync(dir, { recursive: true });
});
