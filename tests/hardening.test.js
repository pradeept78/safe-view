const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');
const { createNotifier } = require('../src/notify');

const PASSWORD = 'test-password-1';
const alerts = [];
let failNextAlert = false;
let server;
let base;

test.before(async () => {
  const db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  const notify = async (enquiry) => {
    if (failNextAlert) {
      failNextAlert = false;
      throw new Error('mail server down');
    }
    alerts.push(enquiry);
  };
  await new Promise((resolve) => { server = createApp(db, { limits: { login: 1000, enquiry: 1000 }, notify }).listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function call(cookie, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}

async function login(username) {
  const res = await call(null, 'POST', '/api/login', { username, password: PASSWORD });
  return res.headers.get('set-cookie').split(';')[0];
}

const line = { glassName: 'GLASS', hsn: '7007', thicknessMm: 5, widthMm: 950, heightMm: 950, qty: 1, rate: 1000, gstPercent: 18 };

test('pages send strong security headers', async () => {
  for (const path of ['/', '/admin/']) {
    const res = await fetch(base + path);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /images\.unsplash\.com/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('permissions-policy'));
  }
});

test('no page depends on inline scripts, which the policy blocks', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/bills', { customerName: 'Print Check', lines: [line] });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  const pages = ['/', '/admin/', '/admin/offline.html'];
  for (const path of pages) {
    const html = await (await fetch(base + path)).text();
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, path);
    assert.doesNotMatch(html, /\son(click|load|submit)=/i, path);
  }
  const print = await (await fetch(`${base}/print/${body.id}`, { headers: { Cookie: admin } })).text();
  assert.doesNotMatch(print, /\sonclick=/i);
  assert.match(print, /<script src="\/print\.js">/);
});

test('a new enquiry sends an alert with its details', async () => {
  alerts.length = 0;
  await call(null, 'POST', '/api/enquiries', { name: 'Alert Customer', phone: '+91 90000 11111', service: 'Mirrors', message: 'Call after 6' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].name, 'Alert Customer');
  assert.equal(alerts[0].service, 'Mirrors');
});

test('a failed alert never loses the enquiry', async () => {
  failNextAlert = true;
  const res = await call(null, 'POST', '/api/enquiries', { name: 'Kept Anyway', phone: '+91 90000 22222' });
  assert.equal(res.status, 201);
  const admin = await login('admin');
  const list = await call(admin, 'GET', '/api/enquiries');
  assert.ok(list.body.some((e) => e.name === 'Kept Anyway'));
});

test('email alerts stay off until they are configured, and use the given settings', async () => {
  const off = createNotifier({});
  assert.equal(off.enabled, false);
  await off({ name: 'A', phone: '1' });

  const sent = [];
  const on = createNotifier({ SMTP_HOST: 'smtp.example.test', SMTP_USER: 'u@example.test', SMTP_PASS: 'x', ALERT_EMAIL: 'owner@example.test' }, {
    createTransport: () => ({ sendMail: async (mail) => sent.push(mail) }),
  });
  assert.equal(on.enabled, true);
  await on({ name: 'New\nBcc: spam@example.test', phone: '+91 90000 33333', service: 'Mirrors', message: 'Hello' });
  assert.equal(sent[0].to, 'owner@example.test');
  assert.doesNotMatch(sent[0].subject, /\n/);
  assert.match(sent[0].text, /\+91 90000 33333/);
  assert.match(sent[0].text, /Hello/);
});

test('the activity log records who did what, without passwords', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  const { body: bill } = await call(partner, 'POST', '/api/bills', { customerName: 'Logged Customer', lines: [line] });
  await call(admin, 'POST', `/api/bills/${bill.id}/approve`);
  await call(admin, 'PUT', `/api/quotations/${bill.id}/won`, { acceptedOn: '2026-10-05' });
  const payment = await call(partner, 'POST', `/api/projects/${bill.id}/payments`, { date: '2026-10-06', amount: 750, method: 'cash' });
  await call(admin, 'DELETE', `/api/payments/${payment.body.id}`);
  await call(admin, 'POST', '/api/users/2/password', { newPassword: 'secret-new-pass-1' });
  await call(admin, 'POST', '/api/users/2/password', { newPassword: PASSWORD });

  const { body } = await call(admin, 'GET', '/api/activity?limit=100');
  const has = (who, action) => body.entries.some((e) => e.who === who && e.action === action);
  assert.ok(has('Partner 2', 'Created a bill'));
  assert.ok(has('Admin', 'Approved a bill'));
  assert.ok(has('Admin', 'Marked an order as won'));
  assert.ok(has('Partner 2', 'Added a customer payment'));
  assert.ok(has('Admin', 'Deleted a customer payment'));
  assert.ok(has('Admin', 'Reset a password'));
  assert.ok(has('Admin', 'Signed in'));
  const deleted = body.entries.find((e) => e.action === 'Deleted a customer payment');
  assert.match(deleted.detail, /750/);
  const created = body.entries.find((e) => e.action === 'Created a bill' && e.detail.includes('Logged Customer'));
  assert.ok(created);
  assert.doesNotMatch(JSON.stringify(body), /secret-new-pass-1|test-password-1/);
});

test('failed actions and previews are not logged, and only the admin can read the log', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  await call(partner, 'PUT', '/api/settings', { gstin: 'X' });
  await call(admin, 'POST', '/api/preview', { lines: [line] });
  const { body } = await call(admin, 'GET', '/api/activity?limit=100');
  assert.equal(body.entries.some((e) => e.who === 'Partner 2' && e.action === 'Changed settings'), false);
  assert.equal(body.entries.some((e) => /preview/i.test(e.action)), false);
  assert.equal((await call(partner, 'GET', '/api/activity')).status, 403);
  assert.equal((await call(null, 'GET', '/api/activity')).status, 401);
});

test('docker logs have a size limit', () => {
  const compose = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  assert.equal((compose.match(/max-size/g) || []).length >= 1, true);
  assert.match(compose, /logging: \*limited-logs/);
});
