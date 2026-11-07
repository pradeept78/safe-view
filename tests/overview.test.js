const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');
const { lastMonths } = require('../src/overview');

const PASSWORD = 'test-password-1';
let server;
let base;

test.before(async () => {
  const db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  await new Promise((resolve) => { server = createApp(db, { limits: { login: 1000, enquiry: 1000 }, notify: async () => {} }).listen(0, resolve); });
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

const line = (rate) => ({ glassName: 'GLASS', hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty: 1, rate, gstPercent: 18 });
const thisMonth = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 7);

async function bill(admin, rate, outcome) {
  const { body } = await call(admin, 'POST', '/api/bills', { customerName: 'Overview', lines: [line(rate)] });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  if (outcome === 'won') await call(admin, 'PUT', `/api/quotations/${body.id}/won`, { acceptedOn: `${thisMonth()}-02` });
  if (outcome === 'lost') await call(admin, 'PUT', `/api/quotations/${body.id}/lost`, { reason: 'Price too high' });
  return body.id;
}

test('the last 12 months run in order across a year change', () => {
  const months = lastMonths(12, '2026-02-15');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2025-03');
  assert.equal(months[10], '2026-01');
  assert.equal(months[11], '2026-02');
});

test('an empty business shows zeros', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'GET', '/api/overview');
  assert.equal(body.sales, 0);
  assert.equal(body.confirmedProfit, 0);
  assert.equal(body.expectedProfit, 0);
  assert.equal(body.recoveredPercent, 0);
  assert.equal(body.months.length, 12);
});

test('totals use won orders before GST, and count all money in and out', async () => {
  const admin = await login('admin');
  const won = await bill(admin, 10000, 'won');
  await bill(admin, 5000, 'lost');
  await bill(admin, 3000, 'waiting');
  const month = thisMonth();
  await call(admin, 'POST', `/api/projects/${won}/payments`, { date: `${month}-03`, amount: 8000, method: 'cash' });
  await call(admin, 'POST', `/api/projects/${won}/vendor-bills`, { date: `${month}-03`, category: 'Glass', vendor: 'V', amount: 4000, paidNow: 4000, method: 'online' });
  await call(admin, 'POST', '/api/expenses', { date: `${month}-04`, category: 'Rent', amount: 1000, method: 'cash' });
  await call(admin, 'POST', '/api/investments', { date: `${month}-01`, person: 'Admin', paidFor: 'Machine', amount: 50000, method: 'online' });

  const { body } = await call(admin, 'GET', '/api/overview');
  assert.equal(body.sales, 10000);
  assert.equal(body.billed, 11800);
  assert.equal(body.received, 8000);
  assert.equal(body.toCollect, 3800);
  assert.equal(body.vendorPaid, 4000);
  assert.equal(body.expenses, 1000);
  assert.equal(body.expectedProfit, 6000);
  assert.equal(body.confirmedProfit, 0);
  assert.equal(body.afterExpenses, -1000);
  assert.equal(body.investment, 50000);
  assert.equal(body.recoveredPercent, 0);
  assert.equal(body.won, 1);
  assert.equal(body.lost, 1);
  assert.equal(body.waiting, 1);

  const current = body.months[11];
  assert.equal(current.month, month);
  assert.equal(current.sales, 10000);
  assert.equal(current.confirmedProfit, 0);

  await call(admin, 'PUT', `/api/projects/${won}/status`, { status: 'completed', completedOn: `${month}-05` });
  const done = (await call(admin, 'GET', '/api/overview')).body;
  assert.equal(done.confirmedProfit, 6000);
  assert.equal(done.afterExpenses, 5000);
  assert.equal(done.recoveredPercent, 10);
  assert.equal(done.months[11].confirmedProfit, 6000);
});

test('a revised bill counts once, at its new value', async () => {
  const admin = await login('admin');
  const before = (await call(admin, 'GET', '/api/overview')).body.sales;
  const id = await bill(admin, 2000, 'won');
  const { body: copy } = await call(admin, 'POST', `/api/bills/${id}/revise`);
  await call(admin, 'PUT', `/api/bills/${copy.id}`, { ...copy, lines: [line(2500)] });
  await call(admin, 'POST', `/api/bills/${copy.id}/approve`);
  assert.equal((await call(admin, 'GET', '/api/overview')).body.sales, before + 2500);
});

test('the overview needs a login', async () => {
  assert.equal((await call(null, 'GET', '/api/overview')).status, 401);
});
