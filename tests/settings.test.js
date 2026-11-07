const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'test-password-1';
let server;
let base;
let cookie;

const save = async (body) => {
  const res = await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test.before(async () => {
  const db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  await new Promise((resolve) => { server = createApp(db, { limits: { login: 1000, enquiry: 1000 }, notify: async () => {} }).listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: PASSWORD }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
});

test.after(() => server.close());

for (const [field, value] of [
  ['default_gst_percent', 'abc'], ['default_gst_percent', ''], ['default_gst_percent', '101'], ['default_gst_percent', '-1'],
  ['default_allowance_mm', 'fifty'], ['default_allowance_mm', ''], ['default_allowance_mm', '-5'],
  ['gstin', '12345'], ['bank_ifsc', 'HDFC123'], ['whatsapp', '12345'], ['email', 'not-an-email'], ['business_name', ' '],
]) {
  test(`settings refuse ${field} set to "${value}", and name the field`, async () => {
    const { status, body } = await save({ [field]: value });
    assert.equal(status, 400);
    assert.equal(body.field, field);
  });
}

test('a refused save changes nothing', async () => {
  await save({ tagline: 'First', default_gst_percent: 'abc' });
  const res = await fetch(`${base}/api/settings`, { headers: { Cookie: cookie } });
  assert.notEqual((await res.json()).tagline, 'First');
});

test('good values are tidied and saved', async () => {
  const { status, body } = await save({
    gstin: ' 29abcde1234f1z5 ', bank_ifsc: 'hdfc0001234', whatsapp: '+91 98765 43210', email: 'shop@example.com', default_gst_percent: '12', default_allowance_mm: '0',
  });
  assert.equal(status, 200);
  assert.equal(body.gstin, '29ABCDE1234F1Z5');
  assert.equal(body.bank_ifsc, 'HDFC0001234');
  assert.equal(body.whatsapp, '919876543210');
  assert.equal(body.default_gst_percent, '12');
  assert.equal(body.default_allowance_mm, '0');
});

test('optional details can be left blank', async () => {
  const { status } = await save({ gstin: '', bank_ifsc: '', whatsapp: '', email: '' });
  assert.equal(status, 200);
});
