const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');
const { daysBetween } = require('../src/insights');

const PASSWORD = 'test-password-1';
let server;
let base;
let admin;

async function call(method, url, body, cookie = admin) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const ago = (days) => new Date(Date.now() + 5.5 * 3600000 - days * 86400000).toISOString().slice(0, 10);
const line = (glassName, rate, qty = 1) => ({ glassName, hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty, rate, gstPercent: 18 });

async function wonOrder(customerName, lines, acceptedDaysAgo) {
  const { body } = await call('POST', '/api/bills', { customerName, lines });
  await call('POST', `/api/bills/${body.id}/approve`);
  await call('PUT', `/api/quotations/${body.id}/won`, { acceptedOn: ago(acceptedDaysAgo) });
  return body.id;
}

test.before(async () => {
  const db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  await new Promise((resolve) => { server = createApp(db, { limits: { login: 1000, enquiry: 1000 }, notify: async () => {} }).listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: PASSWORD }) });
  admin = res.headers.get('set-cookie').split(';')[0];
});

test.after(() => server.close());

test('days are counted between two dates', () => {
  assert.equal(daysBetween('2026-10-01', '2026-11-01'), 31);
  assert.equal(daysBetween('2026-11-08', '2026-11-01'), 0);
});

test('an empty shop has no findings and empty lists', async () => {
  const { status, body } = await call('GET', '/api/insights');
  assert.equal(status, 200);
  assert.deepEqual(body.notices, []);
  assert.deepEqual(body.aging.map((band) => band.amount), [0, 0, 0]);
  assert.deepEqual(body.topCustomers, []);
});

test('money owed is sorted into age bands, oldest first', async () => {
  const fresh = await wonOrder('Fresh Customer', [line('5MM GLASS', 1000)], 5);
  const late = await wonOrder('Late Customer', [line('5MM GLASS', 1000)], 45);
  const old = await wonOrder('Old Customer', [line('5MM GLASS', 1000)], 90);
  const paid = await wonOrder('Paid Customer', [line('5MM GLASS', 1000)], 100);
  const { body: project } = await call('GET', `/api/projects/${paid}`);
  await call('POST', `/api/projects/${paid}/payments`, { date: ago(1), amount: project.balance, method: 'cash' });
  const { body } = await call('GET', '/api/insights');
  assert.deepEqual(body.aging.map((band) => band.count), [1, 1, 1]);
  assert.deepEqual(body.owed.map((order) => order.id), [old, late, fresh]);
  assert.equal(body.owed[0].days, 90);
  assert.ok(!body.owed.some((order) => order.id === paid));
  assert.match(body.notices[0].title, /Old Customer owes ₹[\d,]+ for 90 days/);
  assert.equal(body.notices[0].link, `#/project/${old}`);
});

test('customers count once across orders, and glass sold adds up by material', async () => {
  await wonOrder('Repeat Buyer', [line('8MM GLASS', 2000, 2)], 2);
  await wonOrder(' repeat buyer ', [line('8MM GLASS', 2000, 1), line('MIRROR', 500)], 1);
  const { body } = await call('GET', '/api/insights');
  const buyer = body.topCustomers.find((c) => c.name.trim().toLowerCase() === 'repeat buyer');
  assert.equal(buyer.orders, 2);
  assert.equal(body.topCustomers[0], buyer);
  const eight = body.materials.find((m) => m.name === '8MM GLASS');
  assert.equal(eight.bills, 2);
  assert.equal(eight.areaSqm, 3);
  assert.equal(eight.value, 6000);
  assert.match(body.notices.find((n) => n.title.startsWith('Top customer')).title, /Repeat Buyer/i);
});

test('vendors are ranked by what they billed, with what is still unpaid', async () => {
  const id = await wonOrder('Vendor Check', [line('5MM GLASS', 1000)], 3);
  const cost = (vendor, category, amount, paidNow = 0) => call('POST', `/api/projects/${id}/vendor-bills`, { date: ago(1), vendor, category, amount, paidNow, method: 'cash' });
  await cost('Saint Glass', 'Glass', 5000, 2000);
  await cost('saint glass', 'Hardware', 1000, 1000);
  await cost('Tempo', 'Transport', 300);
  const { body } = await call('GET', '/api/insights');
  assert.deepEqual(body.topVendors[0], { name: 'Saint Glass', types: ['Glass', 'Hardware'], billed: 6000, unpaid: 3000, costs: 2 });
  assert.ok(body.notices.some((n) => /₹3,300 still to pay/.test(n.title)));
});

test('quotations due for a call show up as a finding', async () => {
  const { body: bill } = await call('POST', '/api/bills', { customerName: 'Call Me', lines: [line('5MM GLASS', 1000)] });
  await call('POST', `/api/bills/${bill.id}/approve`);
  await call('PUT', `/api/quotations/${bill.id}/follow-up`, { followUpOn: ago(0) });
  const { body } = await call('GET', '/api/insights');
  assert.ok(body.notices.some((n) => n.title === '1 quotation needs a follow-up call' && n.link === '#/quotations'));
});

test('insights need a login', async () => {
  assert.equal((await call('GET', '/api/insights', null, null)).status, 401);
});
