const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'test-password-1';
let server;
let base;

test.before(async () => {
  const db = openDatabase(':memory:');
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

// Charged as exactly 1 sq m at ₹10,000, so ₹10,000 + 18% GST = ₹11,800.
const line = { glassName: 'GLASS', hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty: 1, rate: 10000, gstPercent: 18 };

async function approvedBill(admin, customerName = 'Project Customer') {
  const { body } = await call(admin, 'POST', '/api/bills', { customerName, lines: [line] });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  await call(admin, 'PUT', `/api/quotations/${body.id}/won`, { acceptedOn: '2026-10-01' });
  return body.id;
}

test('part payments build up the received total and the balance', async () => {
  const admin = await login('admin');
  const id = await approvedBill(admin);
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-01', amount: 5000, method: 'cash' });
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-15', amount: 2000.5, method: 'online', reference: 'UPI123' });
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.equal(body.grandTotal, 11800);
  assert.equal(body.received, 7000.5);
  assert.equal(body.cash, 5000);
  assert.equal(body.online, 2000.5);
  assert.equal(body.balance, 4799.5);
  assert.equal(body.payments[1].reference, 'UPI123');
});

test('a payment cannot be more than the balance', async () => {
  const admin = await login('admin');
  const id = await approvedBill(admin);
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-01', amount: 11000, method: 'cash' });
  const res = await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-02', amount: 801, method: 'cash' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /balance/i);
  assert.equal((await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-02', amount: 800, method: 'cash' })).status, 201);
});

test('profit leaves out GST and takes off vendor payments', async () => {
  const admin = await login('admin');
  const id = await approvedBill(admin);
  await call(admin, 'POST', `/api/projects/${id}/vendor-payments`, { date: '2026-10-03', vendor: 'Glass Supplier', description: 'Toughened glass', amount: 6000, method: 'online' });
  await call(admin, 'POST', `/api/projects/${id}/vendor-payments`, { date: '2026-10-04', vendor: 'Fitter', amount: 1000, method: 'cash' });
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.equal(body.orderValue, 10000);
  assert.equal(body.gst, 1800);
  assert.equal(body.vendorPaid, 7000);
  assert.equal(body.profit, 3000);
  assert.equal(body.vendorPayments.length, 2);
});

test('an order accepted date can be changed, and only won quotations are projects', async () => {
  const admin = await login('admin');
  const id = await approvedBill(admin);
  assert.equal((await call(admin, 'PUT', `/api/projects/${id}/order`, { acceptedOn: '2026-10-05' })).status, 200);
  const list = await call(admin, 'GET', '/api/projects');
  assert.equal(list.body.find((p) => p.id === id).acceptedOn, '2026-10-05');

  const { body: draft } = await call(admin, 'POST', '/api/bills', { customerName: 'Draft', lines: [line] });
  assert.equal(list.body.some((p) => p.id === draft.id), false);
  assert.equal((await call(admin, 'POST', `/api/projects/${draft.id}/payments`, { date: '2026-10-01', amount: 10, method: 'cash' })).status, 404);
});

test('bad money entries are refused', async () => {
  const admin = await login('admin');
  const id = await approvedBill(admin);
  const url = `/api/projects/${id}/payments`;
  assert.equal((await call(admin, 'POST', url, { date: '2026-10-01', amount: 0, method: 'cash' })).status, 400);
  assert.equal((await call(admin, 'POST', url, { date: '2026-10-01', amount: 10, method: 'cheque' })).status, 400);
  assert.equal((await call(admin, 'POST', url, { date: '01/10/2026', amount: 10, method: 'cash' })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/expenses', { date: '2026-10-01', amount: 10, method: 'cash' })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/investments', { date: '2026-10-01', amount: 10, method: 'cash', person: 'Admin' })).status, 400);
});

test('the month shows money in, money out and expenses by category', async () => {
  const admin = await login('admin');
  const id = await approvedBill(admin);
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-08-10', amount: 3000, method: 'cash' });
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-08-11', amount: 2000, method: 'online' });
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-09-01', amount: 999, method: 'cash' });
  await call(admin, 'POST', `/api/projects/${id}/vendor-payments`, { date: '2026-08-12', vendor: 'V', amount: 1500, method: 'online' });
  await call(admin, 'POST', '/api/expenses', { date: '2026-08-01', category: 'Rent', description: 'Shop rent', amount: 800, method: 'online' });
  await call(admin, 'POST', '/api/expenses', { date: '2026-08-20', category: 'Rent', description: 'Godown', amount: 200, method: 'cash' });
  await call(admin, 'POST', '/api/expenses', { date: '2026-08-21', category: 'Transport', description: 'Van', amount: 100, method: 'cash' });

  const { body } = await call(admin, 'GET', '/api/accounts?month=2026-08');
  assert.equal(body.cashIn, 3000);
  assert.equal(body.onlineIn, 2000);
  assert.equal(body.moneyIn, 5000);
  assert.equal(body.vendorPaid, 1500);
  assert.equal(body.expensesTotal, 1100);
  assert.equal(body.leftOver, 2400);
  assert.deepEqual(body.byCategory, [{ category: 'Rent', amount: 1000 }, { category: 'Transport', amount: 100 }]);
  assert.equal(body.expenses.length, 3);
  assert.equal((await call(admin, 'GET', '/api/accounts?month=August')).status, 400);
});

test('investment shows the total, who paid and what it paid for', async () => {
  const admin = await login('admin');
  await call(admin, 'POST', '/api/investments', { date: '2026-06-01', person: 'Admin', paidFor: 'Cutting machine', amount: 50000, method: 'online' });
  await call(admin, 'POST', '/api/investments', { date: '2026-06-02', person: 'Partner 2', paidFor: 'Shop deposit', amount: 30000, method: 'cash' });
  await call(admin, 'POST', '/api/investments', { date: '2026-06-03', person: 'Admin', paidFor: 'Shop deposit', amount: 5000, method: 'cash' });
  const { body } = await call(admin, 'GET', '/api/investments');
  assert.equal(body.total, 85000);
  assert.deepEqual(body.byPerson, [{ person: 'Admin', amount: 55000 }, { person: 'Partner 2', amount: 30000 }]);
  assert.deepEqual(body.byPurpose, [{ paidFor: 'Cutting machine', amount: 50000 }, { paidFor: 'Shop deposit', amount: 35000 }]);
  assert.ok(body.people.includes('Partner 3'));
});

test('partners add entries, only the admin deletes, and everything needs a login', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  const id = await approvedBill(admin);
  const payment = await call(partner, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-01', amount: 100, method: 'cash' });
  assert.equal(payment.status, 201);
  assert.equal(payment.body.createdBy, 'Partner 2');
  assert.equal((await call(partner, 'DELETE', `/api/payments/${payment.body.id}`)).status, 403);
  assert.equal((await call(admin, 'DELETE', `/api/payments/${payment.body.id}`)).status, 200);
  assert.equal((await call(admin, 'GET', `/api/projects/${id}`)).body.received, 0);

  for (const url of ['/api/projects', `/api/projects/${id}`, '/api/accounts?month=2026-08', '/api/investments']) {
    assert.equal((await call(null, 'GET', url)).status, 401);
  }
  assert.equal((await call(null, 'POST', '/api/expenses', { date: '2026-10-01', category: 'Rent', amount: 1, method: 'cash' })).status, 401);
});
