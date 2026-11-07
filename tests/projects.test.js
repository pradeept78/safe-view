const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword, linkVendorPayments } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'test-password-1';
let server;
let base;
let db;

test.before(async () => {
  db = openDatabase(':memory:');
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
const month = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 7);

async function project(admin, rate = 10000) {
  const { body } = await call(admin, 'POST', '/api/bills', { customerName: 'Project', lines: [line(rate)] });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  await call(admin, 'PUT', `/api/quotations/${body.id}/won`, { acceptedOn: `${month()}-02` });
  return body.id;
}

const addBill = (cookie, id, amount, extra = {}) => call(cookie, 'POST', `/api/projects/${id}/vendor-bills`, { date: `${month()}-03`, category: 'Glass', vendor: 'Supplier', description: 'Glass', amount, ...extra });
const addPaid = (cookie, id, vendorBillId, amount) => call(cookie, 'POST', `/api/projects/${id}/vendor-payments`, { date: `${month()}-04`, vendorBillId, amount, method: 'cash' });
const finish = (cookie, id, completedOn = `${month()}-05`) => call(cookie, 'PUT', `/api/projects/${id}/status`, { status: 'completed', completedOn });

test('a new project is in progress, with no costs known yet', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.equal(body.status, 'in_progress');
  assert.equal(body.completedOn, null);
  assert.equal(body.vendorCost, 0);
  assert.equal(body.profit, 10000);
});

test('vendor bills count as costs before they are paid', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const cost = await addBill(admin, id, 6000);
  assert.equal(cost.status, 201);
  await addPaid(admin, id, cost.body.id, 2000);
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.equal(body.vendorBilled, 6000);
  assert.equal(body.vendorPaid, 2000);
  assert.equal(body.vendorDue, 4000);
  assert.equal(body.vendorCost, 6000);
  assert.equal(body.profit, 4000);
  assert.equal(body.vendorBills[0].vendor, 'Supplier');
});

test('each payment reduces the balance of its own cost', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const glass = await addBill(admin, id, 6000);
  const fitting = await addBill(admin, id, 1500, { category: 'Installation', vendor: 'Fitter' });
  await addPaid(admin, id, glass.body.id, 2000);
  await addPaid(admin, id, glass.body.id, 1000);
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  const costs = Object.fromEntries(body.vendorBills.map((cost) => [cost.id, cost]));
  assert.equal(costs[glass.body.id].paid, 3000);
  assert.equal(costs[glass.body.id].due, 3000);
  assert.equal(costs[fitting.body.id].due, 1500);
  assert.equal(body.vendorDue, 4500);
  assert.equal(body.vendorPayments[0].vendor, 'Supplier');
});

test('a cost cannot be paid more than its balance, or from another project', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const other = await project(admin);
  const cost = await addBill(admin, id, 1000);
  await addPaid(admin, id, cost.body.id, 700);
  const over = await addPaid(admin, id, cost.body.id, 301);
  assert.equal(over.status, 400);
  assert.match(over.body.error, /300/);
  assert.equal((await addPaid(admin, id, cost.body.id, 300)).status, 201);
  assert.equal((await addPaid(admin, other, cost.body.id, 1)).status, 400);
  assert.equal((await addPaid(admin, id, undefined, 1)).status, 400);
});

test('installation and transport count as costs and take off profit', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  await addBill(admin, id, 6000);
  await addBill(admin, id, 1500, { category: 'Installation', vendor: 'Fitter' });
  await addBill(admin, id, 500, { category: 'Transport', vendor: 'Tempo' });
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.deepEqual(body.costsByType, [{ type: 'Glass', amount: 6000 }, { type: 'Installation', amount: 1500 }, { type: 'Transport', amount: 500 }]);
  assert.equal(body.vendorCost, 8000);
  assert.equal(body.profit, 2000);
});

test('a cost paid on the spot saves the cost and its payment together', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  assert.equal((await addBill(admin, id, 500, { category: 'Transport', paidNow: 200, method: 'online' })).status, 201);
  assert.equal((await addBill(admin, id, 500, { paidNow: 501, method: 'cash' })).status, 400);
  assert.equal((await addBill(admin, id, 500, { paidNow: 100, method: 'cheque' })).status, 400);
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.equal(body.vendorBills.length, 1);
  assert.equal(body.vendorBills[0].due, 300);
  assert.equal(body.vendorPayments[0].method, 'online');
});

test('a cost with payments cannot be deleted until its payments are', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const cost = await addBill(admin, id, 1000);
  const payment = await addPaid(admin, id, cost.body.id, 100);
  assert.equal((await call(admin, 'DELETE', `/api/vendor-bills/${cost.body.id}`)).status, 409);
  assert.equal((await call(admin, 'DELETE', `/api/vendor-payments/${payment.body.id}`)).status, 200);
  assert.equal((await call(admin, 'DELETE', `/api/vendor-bills/${cost.body.id}`)).status, 200);
});

test('older vendor payments join a matching cost or become a cost of their own', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const cost = await addBill(admin, id, 6000, { vendor: 'Ramesh Glass' });
  const old = db.prepare(`INSERT INTO vendor_payments (bill_id, date, vendor, description, amount, method, created_by, created_at)
    VALUES (?, '2026-10-01', ?, 'Old entry', ?, 'cash', 1, '2026-10-01T00:00:00Z')`);
  old.run(id, ' ramesh glass', 2000);
  old.run(id, 'Fitter', 800);
  linkVendorPayments(db);
  const { body } = await call(admin, 'GET', `/api/projects/${id}`);
  assert.equal(body.vendorBills.find((x) => x.id === cost.body.id).due, 4000);
  const own = body.vendorBills.find((x) => x.vendor === 'Fitter');
  assert.equal(own.category, 'Other');
  assert.equal(own.due, 0);
  assert.equal(body.vendorCost, 6800);
  assert.equal(body.vendorPaid, 2800);
});

test('a project can be completed with a date and reopened for a late bill', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  assert.equal((await call(admin, 'PUT', `/api/projects/${id}/status`, { status: 'completed' })).status, 400);
  assert.equal((await call(admin, 'PUT', `/api/projects/${id}/status`, { status: 'maybe' })).status, 400);
  assert.equal((await finish(admin, id)).status, 200);
  const done = (await call(admin, 'GET', `/api/projects/${id}`)).body;
  assert.equal(done.status, 'completed');
  assert.equal(done.completedOn, `${month()}-05`);
  assert.equal((await addBill(admin, id, 100)).status, 409);
  assert.equal((await call(admin, 'PUT', `/api/projects/${id}/status`, { status: 'in_progress' })).status, 200);
  const open = (await call(admin, 'GET', `/api/projects/${id}`)).body;
  assert.equal(open.status, 'in_progress');
  assert.equal(open.completedOn, null);
  assert.equal((await addBill(admin, id, 100)).status, 201);
});

test('a project with money still owed by the customer can be completed', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const cost = await addBill(admin, id, 100);
  assert.equal((await finish(admin, id)).status, 200);
  assert.equal((await call(admin, 'GET', `/api/projects/${id}`)).body.balance, 11800);
  assert.equal((await call(admin, 'POST', `/api/projects/${id}/payments`, { date: `${month()}-06`, amount: 100, method: 'cash' })).status, 201);
  assert.equal((await addPaid(admin, id, cost.body.id, 50)).status, 201);
});

test('the overview separates confirmed profit, expected profit and vendors to pay', async () => {
  const admin = await login('admin');
  const before = (await call(admin, 'GET', '/api/overview')).body;
  const done = await project(admin, 10000);
  await addBill(admin, done, 6000);
  await finish(admin, done);
  const running = await project(admin, 5000);
  await addBill(admin, running, 1000);
  const { body } = await call(admin, 'GET', '/api/overview');
  assert.equal(body.confirmedProfit - before.confirmedProfit, 4000);
  assert.equal(body.expectedProfit - before.expectedProfit, 4000);
  assert.equal(body.vendorDue - before.vendorDue, 7000);
  assert.equal(body.completed - before.completed, 1);
  assert.equal(body.inProgress - before.inProgress, 1);
  const current = body.months[11];
  assert.ok(current.confirmedProfit >= 4000);
});

test('confirmed profit counts in the month a project finished', async () => {
  const admin = await login('admin');
  const id = await project(admin, 1000);
  const lastMonth = new Date(Date.now() + 5.5 * 3600000);
  lastMonth.setUTCDate(1);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const earlier = lastMonth.toISOString().slice(0, 7);
  await finish(admin, id, `${earlier}-20`);
  const { body } = await call(admin, 'GET', '/api/overview');
  assert.equal(body.months[10].month, earlier);
  assert.equal(body.months[10].confirmedProfit, 1000);
});

test('profit after shop expenses takes expenses off confirmed profit', async () => {
  const admin = await login('admin');
  const before = (await call(admin, 'GET', '/api/overview')).body;
  await call(admin, 'POST', '/api/expenses', { date: `${month()}-07`, category: 'Rent', amount: 500, method: 'cash' });
  const { body } = await call(admin, 'GET', '/api/overview');
  assert.equal(body.afterExpenses, before.afterExpenses - 500);
  assert.equal(body.months[11].net, before.months[11].net - 500);
});

test('a revision keeps the project status, vendor bills and payments', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const cost = await addBill(admin, id, 2000);
  await addPaid(admin, id, cost.body.id, 500);
  await finish(admin, id);
  const { body: copy } = await call(admin, 'POST', `/api/bills/${id}/revise`);
  await call(admin, 'POST', `/api/bills/${copy.id}/approve`);
  const { body } = await call(admin, 'GET', `/api/projects/${copy.id}`);
  assert.equal(body.status, 'completed');
  assert.equal(body.vendorBilled, 2000);
  assert.equal(body.vendorPaid, 500);
});

test('reopening a quotation is blocked by vendor bills or a finished project', async () => {
  const admin = await login('admin');
  const billed = await project(admin);
  const entry = await addBill(admin, billed, 100);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${billed}/reopen`)).status, 409);
  await call(admin, 'DELETE', `/api/vendor-bills/${entry.body.id}`);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${billed}/reopen`)).status, 200);

  const finished = await project(admin);
  await finish(admin, finished);
  const blocked = await call(admin, 'PUT', `/api/quotations/${finished}/reopen`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /reopen the project/i);
});

test('partners can add vendor bills and complete projects, but only the admin deletes', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  const id = await project(admin);
  const entry = await addBill(partner, id, 100);
  assert.equal(entry.status, 201);
  assert.equal((await finish(partner, id)).status, 200);
  assert.equal((await call(partner, 'DELETE', `/api/vendor-bills/${entry.body.id}`)).status, 403);
  assert.equal((await call(null, 'POST', `/api/projects/${id}/vendor-bills`, { date: '2026-10-01', vendor: 'V', amount: 1 })).status, 401);
});

test('bad vendor bills are refused', async () => {
  const admin = await login('admin');
  const id = await project(admin);
  const url = `/api/projects/${id}/vendor-bills`;
  assert.equal((await call(admin, 'POST', url, { date: '2026-10-01', category: 'Glass', amount: 10 })).status, 400);
  assert.equal((await call(admin, 'POST', url, { date: '2026-10-01', category: 'Glass', vendor: 'V', amount: 0 })).status, 400);
  assert.equal((await call(admin, 'POST', url, { date: 'soon', category: 'Glass', vendor: 'V', amount: 10 })).status, 400);
  assert.equal((await call(admin, 'POST', url, { date: '2026-10-01', category: 'Snacks', vendor: 'V', amount: 10 })).status, 400);
});
