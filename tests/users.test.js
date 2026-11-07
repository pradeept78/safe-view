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
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}

async function login(username, password = PASSWORD) {
  const res = await call(null, 'POST', '/api/login', { username, password });
  return res.status === 200 ? res.headers.get('set-cookie').split(';')[0] : null;
}

const newUser = (username) => ({ name: 'New Person', username, role: 'partner', password: 'first-password' });

test('the admin adds a user who can then sign in', async () => {
  const admin = await login('admin');
  const made = await call(admin, 'POST', '/api/users', newUser('ravi'));
  assert.equal(made.status, 201);
  assert.equal('pass_hash' in made.body, false);
  assert.ok(await login('ravi', 'first-password'));
  const list = await call(admin, 'GET', '/api/users');
  assert.ok(list.body.some((u) => u.username === 'ravi' && u.active === 1));
  assert.equal(JSON.stringify(list.body).includes('pass_hash'), false);
});

test('bad new users are refused', async () => {
  const admin = await login('admin');
  assert.equal((await call(admin, 'POST', '/api/users', { ...newUser('short'), password: '123' })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/users', { ...newUser('has space') })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/users', { ...newUser('rolecheck'), role: 'owner' })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/users', { ...newUser('noname'), name: '' })).status, 400);
  const duplicate = await call(admin, 'POST', '/api/users', newUser('admin'));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /already/i);
});

test('the admin edits a name and role, and the new role takes effect', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/users', newUser('meena'));
  const session = await login('meena', 'first-password');
  assert.equal((await call(session, 'GET', '/api/users')).status, 403);
  assert.equal((await call(admin, 'PUT', `/api/users/${body.id}`, { name: 'Meena K', role: 'admin', active: true })).status, 200);
  const me = await call(session, 'GET', '/api/me');
  assert.equal(me.body.name, 'Meena K');
  assert.equal(me.body.role, 'admin');
  assert.equal((await call(session, 'GET', '/api/users')).status, 200);
});

test('turning a user off signs them out and blocks sign-in, and turning on restores it', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/users', newUser('leaver'));
  const session = await login('leaver', 'first-password');
  await call(admin, 'PUT', `/api/users/${body.id}`, { name: 'New Person', role: 'partner', active: false });
  assert.equal((await call(session, 'GET', '/api/me')).status, 401);
  assert.equal(await login('leaver', 'first-password'), null);
  await call(admin, 'PUT', `/api/users/${body.id}`, { name: 'New Person', role: 'partner', active: true });
  assert.ok(await login('leaver', 'first-password'));
});

test('a password reset works at once and ends old sessions', async () => {
  const admin = await login('admin');
  const { body } = await call(admin, 'POST', '/api/users', newUser('forgot'));
  const session = await login('forgot', 'first-password');
  assert.equal((await call(admin, 'POST', `/api/users/${body.id}/password`, { newPassword: 'short' })).status, 400);
  assert.equal((await call(admin, 'POST', `/api/users/${body.id}/password`, { newPassword: 'second-password' })).status, 200);
  assert.equal((await call(session, 'GET', '/api/me')).status, 401);
  assert.equal(await login('forgot', 'first-password'), null);
  assert.ok(await login('forgot', 'second-password'));
});

test('the last active admin cannot be turned off or made a partner', async () => {
  const admin = await login('admin');
  const everyone = (await call(admin, 'GET', '/api/users')).body;
  const me = everyone.find((u) => u.username === 'admin');
  for (const other of everyone.filter((u) => u.role === 'admin' && u.id !== me.id)) {
    await call(admin, 'PUT', `/api/users/${other.id}`, { name: other.name, role: 'partner', active: true });
  }
  const off = await call(admin, 'PUT', `/api/users/${me.id}`, { name: 'Admin', role: 'admin', active: false });
  assert.equal(off.status, 400);
  assert.match(off.body.error, /admin/i);
  assert.equal((await call(admin, 'PUT', `/api/users/${me.id}`, { name: 'Admin', role: 'partner', active: true })).status, 400);
});

test('the emergency reset gives a working password, restores access and ends sessions', () => {
  const { checkPassword } = require('../src/db');
  const { resetPassword } = require('../scripts/reset-password');
  const db = openDatabase(':memory:');
  db.prepare("UPDATE users SET active = 0 WHERE username = 'admin'").run();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('old', 1, 9999999999999)").run();
  const password = resetPassword(db, ' Admin ');
  assert.ok(password.length >= 12);
  const user = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  assert.equal(checkPassword(password, user), true);
  assert.equal(user.active, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(resetPassword(db, 'nobody'), null);
  db.close();
});

test('a successful sign-in clears failed attempts, and repeated failures are blocked', async () => {
  const db = openDatabase(':memory:');
  const { hash, salt } = hashPassword(PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  const limited = await new Promise((resolve) => { const s = createApp(db, { limits: { login: 3, enquiry: 5 } }).listen(0, () => resolve(s)); });
  const attempt = (password) => fetch(`http://127.0.0.1:${limited.address().port}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }),
  }).then((res) => res.status);
  for (let round = 0; round < 3; round += 1) {
    assert.equal(await attempt('wrong'), 401);
    assert.equal(await attempt('wrong'), 401);
    assert.equal(await attempt(PASSWORD), 200);
  }
  assert.equal(await attempt('wrong'), 401);
  assert.equal(await attempt('wrong'), 401);
  assert.equal(await attempt('wrong'), 401);
  assert.equal(await attempt(PASSWORD), 429);
  limited.close();
});

test('partners cannot manage users, and a user that does not exist is reported', async () => {
  const admin = await login('admin');
  const partner = await login('partner2');
  assert.equal((await call(partner, 'POST', '/api/users', newUser('sneaky'))).status, 403);
  assert.equal((await call(partner, 'PUT', '/api/users/1', { name: 'X', role: 'partner', active: true })).status, 403);
  assert.equal((await call(partner, 'POST', '/api/users/1/password', { newPassword: 'taken-over-1' })).status, 403);
  assert.equal((await call(null, 'GET', '/api/users')).status, 401);
  assert.equal((await call(admin, 'PUT', '/api/users/9999', { name: 'X', role: 'partner', active: true })).status, 404);
});
