const test = require('node:test');
const assert = require('node:assert/strict');
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
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
}

async function login(username) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

const line = (rate = 10000) => ({ glassName: 'GLASS', hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty: 1, rate, gstPercent: 18 });

async function makeBill(admin, { customerName = 'Customer', customerPhone = '', state = '29', rate = 10000, won = false } = {}) {
  const { body } = await call(admin, 'POST', '/api/bills', { customerName, customerPhone, customerAddress: 'Somewhere', customerStateCode: state, lines: [line(rate)] });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  if (won) await call(admin, 'PUT', `/api/quotations/${body.id}/won`, { acceptedOn: '2026-10-05' });
  return body.id;
}

async function businessDetails(admin) {
  await call(admin, 'PUT', '/api/settings', { gstin: '29ABCDE1234F1Z5', address: 'Shop Road, Bengaluru' });
}

// ----- Revising an approved bill -----

test('revising makes an editable copy and the old bill stays valid until it is approved', async () => {
  const admin = await login('admin');
  const id = await makeBill(admin, { won: true });
  const made = await call(admin, 'POST', `/api/bills/${id}/revise`);
  assert.equal(made.status, 201);
  assert.equal(made.body.status, 'draft');
  assert.equal(made.body.revisesId, id);
  assert.equal(made.body.number, null);
  assert.equal(made.body.lines[0].rate, 10000);

  const old = (await call(admin, 'GET', `/api/bills/${id}`)).body;
  assert.equal(old.supersededBy, null);
  assert.equal(old.openRevisionId, made.body.id);
  assert.equal((await call(admin, 'GET', `/api/projects/${id}`)).status, 200);

  const second = await call(admin, 'POST', `/api/bills/${id}/revise`);
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already/i);
});

test('approving a revision moves the order, payments and vendor costs to the new bill', async () => {
  const admin = await login('admin');
  const id = await makeBill(admin, { won: true });
  await call(admin, 'POST', `/api/projects/${id}/payments`, { date: '2026-10-06', amount: 3000, method: 'cash' });
  await call(admin, 'POST', `/api/projects/${id}/vendor-payments`, { date: '2026-10-07', vendor: 'V', amount: 1000, method: 'online' });

  const { body: revision } = await call(admin, 'POST', `/api/bills/${id}/revise`);
  await call(admin, 'PUT', `/api/bills/${revision.id}`, { ...revision, lines: [line(12000)] });
  const approved = await call(admin, 'POST', `/api/bills/${revision.id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.quoteStatus, 'won');
  assert.equal(approved.body.acceptedOn, '2026-10-05');
  assert.equal(approved.body.revisesNumber !== null, true);

  const project = (await call(admin, 'GET', `/api/projects/${revision.id}`)).body;
  assert.equal(project.orderValue, 12000);
  assert.equal(project.received, 3000);
  assert.equal(project.vendorPaid, 1000);
  assert.equal(project.profit, 11000);

  const old = (await call(admin, 'GET', `/api/bills/${id}`)).body;
  assert.equal(old.supersededBy, revision.id);
  assert.equal(old.supersededByNumber, approved.body.number);
  assert.notEqual(old.number, null);
  assert.equal((await call(admin, 'GET', `/api/projects/${id}`)).status, 404);
  const projects = (await call(admin, 'GET', '/api/projects')).body;
  assert.equal(projects.some((p) => p.id === id), false);
});

test('a replaced bill is out of the report and locked, but still prints marked as revised', async () => {
  const admin = await login('admin');
  const range = '/api/quotations?from=2000-01-01&to=2100-01-01';
  const before = (await call(admin, 'GET', range)).body.sent;
  const id = await makeBill(admin);
  const { body: revision } = await call(admin, 'POST', `/api/bills/${id}/revise`);
  await call(admin, 'POST', `/api/bills/${revision.id}/approve`);
  const after = (await call(admin, 'GET', range)).body;
  assert.equal(after.sent, before + 1);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/won`, { acceptedOn: '2026-10-05' })).status, 404);
  assert.equal((await call(admin, 'POST', `/api/bills/${id}/revise`)).status, 409);
  const printed = await call(admin, 'GET', `/print/${id}`);
  assert.equal(printed.status, 200);
  assert.match(printed.body, /Replaced by/);
});

test('deleting a revision leaves the old bill as it was and it can be revised again', async () => {
  const admin = await login('admin');
  const id = await makeBill(admin);
  const { body: revision } = await call(admin, 'POST', `/api/bills/${id}/revise`);
  assert.equal((await call(admin, 'DELETE', `/api/bills/${revision.id}`)).status, 200);
  const old = (await call(admin, 'GET', `/api/bills/${id}`)).body;
  assert.equal(old.openRevisionId, null);
  assert.equal((await call(admin, 'POST', `/api/bills/${id}/revise`)).status, 201);
});

test('only approved, open bills can be revised', async () => {
  const admin = await login('admin');
  const { body: draft } = await call(admin, 'POST', '/api/bills', { customerName: 'Draft', lines: [line()] });
  assert.equal((await call(admin, 'POST', `/api/bills/${draft.id}/revise`)).status, 409);
  const lost = await makeBill(admin);
  await call(admin, 'PUT', `/api/quotations/${lost}/lost`, { reason: 'Project postponed' });
  const blocked = await call(admin, 'POST', `/api/bills/${lost}/revise`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /reopen/i);
});

test('a bill can be revised again and again, and lists show only the latest version', async () => {
  const admin = await login('admin');
  const first = await makeBill(admin, { customerName: 'Many Versions', won: true });
  await call(admin, 'POST', `/api/projects/${first}/payments`, { date: '2026-10-06', amount: 500, method: 'cash' });
  const revise = async (id) => {
    const { body } = await call(admin, 'POST', `/api/bills/${id}/revise`);
    await call(admin, 'POST', `/api/bills/${body.id}/approve`);
    return body.id;
  };
  const second = await revise(first);
  const third = await revise(second);

  const latest = (await call(admin, 'GET', `/api/bills/${third}`)).body;
  assert.equal(latest.history.length, 3);
  assert.deepEqual(latest.history.map((v) => v.id), [first, second, third]);
  assert.equal((await call(admin, 'GET', `/api/bills/${first}`)).body.history.length, 3);
  assert.equal((await call(admin, 'GET', `/api/projects/${third}`)).body.received, 500);

  const normal = (await call(admin, 'GET', '/api/bills?q=many%20versions')).body;
  assert.deepEqual(normal.bills.map((b) => b.id), [third]);
  const old = (await call(admin, 'GET', '/api/bills?q=many%20versions&status=revised')).body;
  assert.equal(old.total, 2);
});

// ----- Search -----

test('search finds bills by customer, phone and number, and filters by status', async () => {
  const admin = await login('admin');
  const id = await makeBill(admin, { customerName: 'Zebra Interiors', customerPhone: '+91 77777 12345', won: true });
  const number = (await call(admin, 'GET', `/api/bills/${id}`)).body.number;
  await makeBill(admin, { customerName: 'Zebra Waiting' });
  const find = async (query) => (await call(admin, 'GET', `/api/bills?${query}`)).body;

  assert.deepEqual((await find('q=zebra%20int')).bills.map((b) => b.id), [id]);
  assert.deepEqual((await find('q=77777')).bills.map((b) => b.id), [id]);
  assert.deepEqual((await find(`q=${encodeURIComponent(number)}`)).bills.map((b) => b.id), [id]);
  assert.equal((await find('q=zebra&status=won')).total, 1);
  assert.equal((await find('q=zebra&status=waiting')).bills[0].customerName, 'Zebra Waiting');
  assert.equal((await find('q=100%25')).total, 0);
  assert.equal((await call(admin, 'GET', '/api/bills?status=nonsense')).status, 400);
});

test('bills load in pages, and the summary counts everything', async () => {
  const admin = await login('admin');
  for (let i = 0; i < 3; i += 1) await call(admin, 'POST', '/api/bills', { customerName: 'Paged Customer', lines: [line(100)] });
  const first = (await call(admin, 'GET', '/api/bills?q=paged&limit=2')).body;
  assert.equal(first.bills.length, 2);
  assert.equal(first.total, 3);
  const next = (await call(admin, 'GET', '/api/bills?q=paged&limit=2&offset=2')).body;
  assert.equal(next.bills.length, 1);
  assert.ok(first.stats.drafts >= 3);
  assert.equal(typeof first.stats.waiting, 'number');
  assert.equal(typeof first.stats.approvedThisMonth, 'number');
});

// ----- Tax invoices -----

test('a won order gets a tax invoice numbered by financial year', async () => {
  const admin = await login('admin');
  await businessDetails(admin);
  const first = await makeBill(admin, { won: true });
  const second = await makeBill(admin, { won: true });
  const third = await makeBill(admin, { won: true });
  const a = await call(admin, 'POST', `/api/bills/${first}/tax-invoice`, { date: '2026-10-10', stateCode: '29' });
  const b = await call(admin, 'POST', `/api/bills/${second}/tax-invoice`, { date: '2026-10-11', stateCode: '29' });
  const c = await call(admin, 'POST', `/api/bills/${third}/tax-invoice`, { date: '2026-03-20', stateCode: '29' });
  assert.equal(a.status, 201);
  assert.equal(a.body.invoiceNumber, 'SV/26-27/00001');
  assert.equal(b.body.invoiceNumber, 'SV/26-27/00002');
  assert.equal(c.body.invoiceNumber, 'SV/25-26/00001');
  assert.ok(a.body.invoiceNumber.length <= 16);
  assert.equal((await call(admin, 'POST', `/api/bills/${first}/tax-invoice`, { date: '2026-10-12', stateCode: '29' })).status, 409);
});

test('a tax invoice needs a won order, your GST details and valid dates', async () => {
  const admin = await login('admin');
  const waiting = await makeBill(admin);
  const won = await makeBill(admin, { won: true });
  await businessDetails(admin);
  const send = (id, body) => call(admin, 'POST', `/api/bills/${id}/tax-invoice`, body);
  assert.equal((await send(waiting, { date: '2026-10-10', stateCode: '29' })).status, 409);
  assert.equal((await send(won, { date: 'soon', stateCode: '29' })).status, 400);
  assert.equal((await send(won, { date: '2999-01-01', stateCode: '29' })).status, 400);
  assert.equal((await send(won, { date: '2026-10-10', stateCode: 'KA' })).status, 400);
  await call(admin, 'PUT', '/api/settings', { gstin: '' });
  const missing = await send(won, { date: '2026-10-10', stateCode: '29' });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /GST/);
  await businessDetails(admin);
});

test('only the admin issues invoices, and an invoiced order cannot be changed', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  await businessDetails(admin);
  const id = await makeBill(admin, { won: true });
  assert.equal((await call(partner, 'POST', `/api/bills/${id}/tax-invoice`, { date: '2026-10-10', stateCode: '29' })).status, 403);
  await call(admin, 'POST', `/api/bills/${id}/tax-invoice`, { date: '2026-10-10', stateCode: '29' });
  const revise = await call(admin, 'POST', `/api/bills/${id}/revise`);
  assert.equal(revise.status, 409);
  assert.match(revise.body.error, /tax invoice/i);
  assert.equal((await call(admin, 'PUT', `/api/quotations/${id}/reopen`)).status, 409);
});

test('an open revision blocks a tax invoice, and an invoice blocks approving a revision', async () => {
  const admin = await login('admin');
  await businessDetails(admin);
  const id = await makeBill(admin, { won: true });
  const { body: revision } = await call(admin, 'POST', `/api/bills/${id}/revise`);
  assert.equal((await call(admin, 'POST', `/api/bills/${id}/tax-invoice`, { date: '2026-10-10', stateCode: '29' })).status, 409);
  db.prepare("UPDATE bills SET invoice_number = 'SV/99-00/00001', invoice_fy = '99-00', invoice_seq = 1 WHERE id = ?").run(id);
  assert.equal((await call(admin, 'POST', `/api/bills/${revision.id}/approve`)).status, 409);
});

test('the printed invoice uses CGST and SGST in state, and IGST for another state', async () => {
  const admin = await login('admin');
  await businessDetails(admin);
  const local = await makeBill(admin, { won: true });
  const away = await makeBill(admin, { won: true, state: '27' });
  await call(admin, 'POST', `/api/bills/${local}/tax-invoice`, { date: '2026-10-10', stateCode: '29' });
  await call(admin, 'POST', `/api/bills/${away}/tax-invoice`, { date: '2026-10-10', stateCode: '27' });

  const here = (await call(admin, 'GET', `/print/${local}/tax-invoice`)).body;
  assert.match(here, /TAX INVOICE/);
  assert.match(here, /C-GST 9%/);
  assert.doesNotMatch(here, /IGST/);
  assert.match(here, /29ABCDE1234F1Z5/);
  assert.match(here, /Place of Supply/);

  const there = (await call(admin, 'GET', `/print/${away}/tax-invoice`)).body;
  assert.match(there, /IGST 18%/);
  assert.match(there, /1,800\.00/);
  assert.doesNotMatch(there, /C-GST/);
});

test('an invoice keeps the business details it was issued with, and printing needs one', async () => {
  const admin = await login('admin');
  await businessDetails(admin);
  const id = await makeBill(admin, { won: true });
  assert.equal((await call(admin, 'GET', `/print/${id}/tax-invoice`)).status, 404);
  await call(admin, 'POST', `/api/bills/${id}/tax-invoice`, { date: '2026-10-10', stateCode: '29' });
  await call(admin, 'PUT', '/api/settings', { address: 'A New Address' });
  const printed = (await call(admin, 'GET', `/print/${id}/tax-invoice`)).body;
  assert.match(printed, /Shop Road/);
  assert.doesNotMatch(printed, /A New Address/);
  await businessDetails(admin);
  assert.equal((await call(null, 'GET', `/print/${id}/tax-invoice`)).status, 401);
});
