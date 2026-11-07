const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'test-password-1';
let server;
let base;
let cookie;

const search = async (q, headers = { Cookie: cookie }) => {
  const res = await fetch(`${base}/api/customers?q=${encodeURIComponent(q)}`, { headers });
  return { status: res.status, body: await res.json() };
};

const addBill = (customer) => fetch(`${base}/api/bills`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ ...customer, lines: [{ glassName: 'GLASS', hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty: 1, rate: 100, gstPercent: 18 }] }),
});

test.before(async () => {
  const db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  await new Promise((resolve) => { server = createApp(db, { limits: { login: 1000, enquiry: 1000 }, notify: async () => {} }).listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: PASSWORD }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
  await addBill({ customerName: 'Ravi Kumar', customerPhone: '+91 98765 43210', customerAddress: 'Old address', customerGstin: '29AAAAA0000A1Z5', customerStateCode: '29' });
  await addBill({ customerName: 'ravi kumar ', customerPhone: '+91 98765 43210', customerAddress: 'New address', customerGstin: '29AAAAA0000A1Z5', customerStateCode: '29' });
  await addBill({ customerName: 'Ravi Kumar', customerPhone: '+91 90000 11111' });
  await addBill({ customerName: 'Meena 100% Glass', customerPhone: '' });
});

test.after(() => server.close());

test('a repeat customer shows once, with their latest details', async () => {
  const { body } = await search('98765');
  assert.equal(body.length, 1);
  assert.equal(body[0].address, 'New address');
  assert.equal(body[0].gstin, '29AAAAA0000A1Z5');
  assert.equal(body[0].stateCode, '29');
});

test('customers are found by name, or by phone typed without spaces', async () => {
  assert.equal((await search('ravi')).body.length, 2);
  assert.equal((await search('9876543210')).body.length, 1);
  assert.equal((await search('+91 90000')).body[0].phone, '+91 90000 11111');
});

test('short searches return nothing, and % is treated as plain text', async () => {
  assert.deepEqual((await search('r')).body, []);
  assert.equal((await search('0%')).body.length, 1);
  assert.deepEqual((await search('%%')).body, []);
});

test('customer search needs a login', async () => {
  assert.equal((await search('ravi', {})).status, 401);
});
