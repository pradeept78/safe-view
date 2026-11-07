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
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
}

async function login(username) {
  const res = await call(null, 'POST', '/api/login', { username, password: PASSWORD });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

const draft = {
  customerName: 'Test Customer',
  lines: [{ glassName: '5MM CLEAR TOUGHENED GLASS', hsn: '70071100', thicknessMm: 5, widthMm: 1200, heightMm: 970, qty: 3, rate: 684.15 }],
};

test('a partner drafts, the admin approves, and only then it prints', async () => {
  const partner = await login('partner2');
  const admin = await login('admin');

  const created = await call(partner, 'POST', '/api/bills', draft);
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.equal(created.body.status, 'draft');
  assert.equal(created.body.number, null);
  assert.equal(created.body.totals.basic, 2616.87);

  assert.equal((await call(partner, 'GET', `/print/${id}`)).status, 403);
  assert.equal((await call(partner, 'POST', `/api/bills/${id}/approve`)).status, 403);
  assert.equal((await call(partner, 'POST', `/api/bills/${id}/submit`)).status, 200);
  assert.equal((await call(partner, 'PUT', `/api/bills/${id}`, draft)).status, 409);
  assert.equal((await call(partner, 'POST', `/api/bills/${id}/approve`)).status, 403);

  const approved = await call(admin, 'POST', `/api/bills/${id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');
  assert.match(approved.body.number, /^PI\/\d{5}$/);
  assert.equal(approved.body.preparedBy, 'Partner 2');
  assert.equal(approved.body.checkedBy, 'Admin');

  const printed = await call(partner, 'GET', `/print/${id}`);
  assert.equal(printed.status, 200);
  assert.match(printed.body, /PROFORMA INVOICE/);
  assert.match(printed.body, /Test Customer/);
});

test('approved bills are locked for everyone', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/bills', draft);
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  assert.equal((await call(admin, 'PUT', `/api/bills/${body.id}`, draft)).status, 409);
  assert.equal((await call(admin, 'DELETE', `/api/bills/${body.id}`)).status, 409);
  assert.equal((await call(admin, 'POST', `/api/bills/${body.id}/approve`)).status, 409);
});

test('the admin can send a bill back with a note, and it can be edited again', async () => {
  const partner = await login('partner3');
  const admin = await login('admin');
  const { body } = await call(partner, 'POST', '/api/bills', draft);
  await call(partner, 'POST', `/api/bills/${body.id}/submit`);
  assert.equal((await call(partner, 'POST', `/api/bills/${body.id}/return`, { note: 'x' })).status, 403);
  const back = await call(admin, 'POST', `/api/bills/${body.id}/return`, { note: 'Check the width' });
  assert.equal(back.body.status, 'draft');
  assert.equal(back.body.returnNote, 'Check the width');
  assert.equal((await call(partner, 'PUT', `/api/bills/${body.id}`, draft)).status, 200);
});

test('bill numbers run in order of approval with no gaps', async () => {
  const admin = await login('admin');
  const first = await call(admin, 'POST', '/api/bills', draft);
  const second = await call(admin, 'POST', '/api/bills', draft);
  const b = await call(admin, 'POST', `/api/bills/${second.body.id}/approve`);
  const a = await call(admin, 'POST', `/api/bills/${first.body.id}/approve`);
  const n = (bill) => Number(bill.body.number.slice(3));
  assert.equal(n(a), n(b) + 1);
});

test('an approved bill keeps the business details it was approved with', async () => {
  const admin = await login('admin');
  await call(admin, 'PUT', '/api/settings', { gstin: '29OLDGS1234F1Z5' });
  const { body } = await call(admin, 'POST', '/api/bills', draft);
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  await call(admin, 'PUT', '/api/settings', { gstin: '29NEWGS1234F1Z5' });
  const printed = await call(admin, 'GET', `/print/${body.id}`);
  assert.match(printed.body, /29OLDGS1234F1Z5/);
  assert.doesNotMatch(printed.body, /29NEWGS1234F1Z5/);
});

test('printouts escape what people type', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/bills', { ...draft, customerName: '<script>alert(1)</script>' });
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  const printed = await call(admin, 'GET', `/print/${body.id}`);
  assert.doesNotMatch(printed.body, /<script>alert/);
});

test('a material carries its GST, and a bill can mix rates, manual prices and extra charges', async () => {
  const admin = await login('admin');
  const made = await call(admin, 'POST', '/api/glass-types', { name: '10MM CLEAR', hsn: '7007', thickness_mm: 10, rate: 1000, gst_percent: 12 });
  assert.equal(made.status, 201);
  assert.equal(made.body.gst_percent, 12);
  assert.equal((await call(admin, 'POST', '/api/glass-types', { name: 'X', thickness_mm: 5, rate: 1, gst_percent: '' })).status, 400);

  const line = { glassName: '10MM CLEAR', hsn: '7007', thicknessMm: 10, widthMm: 950, heightMm: 950, qty: 1, rate: 1200, listRate: 1000, gstPercent: 12 };
  const custom = { glassName: 'ONE-OFF FROSTED', hsn: '', thicknessMm: 6, widthMm: 950, heightMm: 950, qty: 1, rate: 500, gstPercent: 18, custom: true };
  const { body } = await call(admin, 'POST', '/api/bills', { customerName: 'Mixed', lines: [line, custom], extras: [{ description: 'Fitting', hsn: '9954', amount: 300, gstPercent: 18 }] });
  assert.equal(body.lines[0].listRate, 1000);
  assert.equal(body.lines[1].custom, true);
  assert.equal(body.totals.basic, 2000);
  assert.deepEqual(body.totals.taxes.map((t) => t.percent), [12, 18]);

  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  const printed = await call(admin, 'GET', `/print/${body.id}`);
  assert.match(printed.body, /ADDITIONAL CHARGES/);
  assert.match(printed.body, /Fitting/);
  assert.match(printed.body, /C-GST 6%/);
  assert.match(printed.body, /C-GST 9%/);
});

test('bills saved before this change still open and print', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/bills', draft);
  const totals = { ...body.totals, gstPercent: 18 };
  delete totals.taxes;
  db.prepare("UPDATE bills SET totals_json = ?, extras_json = '[]' WHERE id = ?").run(JSON.stringify(totals), body.id);
  await call(admin, 'POST', `/api/bills/${body.id}/approve`);
  const printed = await call(admin, 'GET', `/print/${body.id}`);
  assert.equal(printed.status, 200);
  assert.match(printed.body, /C-GST 9%/);
});

test('an older database gains the new columns and keeps its data', () => {
  const Database = require('better-sqlite3');
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-'));
  const file = path.join(dir, 'old.db');
  const old = new Database(file);
  old.exec(`CREATE TABLE glass_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, hsn TEXT NOT NULL DEFAULT '', thickness_mm REAL NOT NULL, rate REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    INSERT INTO glass_types (name, thickness_mm, rate) VALUES ('OLD GLASS', 5, 100);`);
  old.close();
  const upgraded = openDatabase(file);
  const row = upgraded.prepare("SELECT * FROM glass_types WHERE name = 'OLD GLASS'").get();
  assert.equal(row.rate, 100);
  assert.equal(row.gst_percent, 18);
  upgraded.close();
  fs.rmSync(dir, { recursive: true });
});

test('private pages need a login, and partners cannot change settings', async () => {
  const partner = await login('partner2');
  assert.equal((await call(null, 'GET', '/api/bills')).status, 401);
  assert.equal((await call(null, 'GET', '/api/enquiries')).status, 401);
  assert.equal((await call(null, 'GET', '/print/1')).status, 401);
  assert.equal((await call(partner, 'PUT', '/api/settings', { gstin: 'X' })).status, 403);
  assert.equal((await call(partner, 'POST', '/api/glass-types', { name: 'X', thickness_mm: 5, rate: 1, gst_percent: 18 })).status, 403);
  assert.equal((await call(null, 'POST', '/api/login', { username: 'admin', password: 'wrong' })).status, 401);
});

test('a website enquiry reaches the dashboard', async () => {
  const partner = await login('partner2');
  assert.equal((await call(null, 'POST', '/api/enquiries', { name: 'Asha', phone: 'abc' })).status, 400);
  assert.equal((await call(null, 'POST', '/api/enquiries', { name: 'Asha', phone: '+91 98765 43210', service: 'Mirrors' })).status, 201);
  const list = await call(partner, 'GET', '/api/enquiries');
  assert.equal(list.body[0].name, 'Asha');
  assert.equal((await call(partner, 'PUT', `/api/enquiries/${list.body[0].id}`, { status: 'contacted' })).status, 200);
});

test('limits count each visitor separately behind the HTTPS proxy', async () => {
  const limited = createApp(db, { limits: { login: 1000, enquiry: 1 } });
  const proxy = await new Promise((resolve) => { const s = limited.listen(0, () => resolve(s)); });
  const send = (ip) => fetch(`http://127.0.0.1:${proxy.address().port}/api/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ name: 'Limit Test', phone: '+91 98765 43210' }),
  });
  assert.equal((await send('203.0.113.1')).status, 201);
  assert.equal((await send('203.0.113.1')).status, 429);
  assert.equal((await send('203.0.113.2')).status, 201);
  proxy.close();
});

test('the health check answers without a login', async () => {
  const res = await call(null, 'GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('a backup is a working copy of the database and old ones are removed', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const Database = require('better-sqlite3');
  const { backupDatabase } = require('../scripts/backup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-backup-'));
  const file = path.join(dir, 'live.db');
  const live = openDatabase(file);
  live.prepare("INSERT INTO enquiries (name, phone, created_at) VALUES ('Kept', '+91 90000 00000', 'now')").run();

  const folder = path.join(dir, 'backups');
  fs.mkdirSync(folder);
  const old = path.join(folder, 'safe-view-2020-01-01.db');
  fs.writeFileSync(old, 'old');
  fs.utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'));
  const unrelated = path.join(folder, 'notes.txt');
  fs.writeFileSync(unrelated, 'keep me');
  fs.utimesSync(unrelated, new Date('2020-01-01'), new Date('2020-01-01'));

  const target = await backupDatabase({ dbFile: file, backupDir: folder, keepDays: 14 });
  const copy = new Database(target, { readonly: true });
  assert.equal(copy.prepare('SELECT name FROM enquiries').get().name, 'Kept');
  copy.close();
  live.close();
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(unrelated), true);
  fs.rmSync(dir, { recursive: true });
});

test('the installable app files are served, and saved files never include private data', async () => {
  const get = (path) => fetch(base + path);
  const manifest = await (await get('/admin/manifest.webmanifest')).json();
  assert.equal(manifest.start_url, '/admin/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const res = await get(`/admin/${icon.src}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/png/);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  assert.equal((await get('/admin/offline.html')).status, 200);

  const worker = await get('/admin/sw.js');
  assert.match(worker.headers.get('content-type'), /javascript/);
  const code = await worker.text();
  const shell = code.match(/const SHELL = \[([\s\S]*?)\]/)[1];
  assert.doesNotMatch(shell, /\/api|\/print/);
  for (const path of shell.match(/'[^']+'/g).map((item) => item.slice(1, -1))) {
    assert.equal((await get(path)).status, 200, path);
  }
});

test('public details leave out bank and tax settings', async () => {
  const { body } = await call(null, 'GET', '/api/public');
  assert.equal(body.business_name, 'Safe View Glass Solutions');
  assert.equal('bank_account' in body, false);
  assert.equal('next_bill_number' in body, false);
});
