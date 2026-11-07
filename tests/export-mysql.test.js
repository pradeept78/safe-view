const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db');
const { toMysql, quoteValue } = require('../scripts/export-mysql');

test('values are escaped for MySQL', () => {
  assert.equal(quoteValue(null), 'NULL');
  assert.equal(quoteValue(12.5), '12.5');
  assert.equal(quoteValue("O'Brien \\ Sons"), "'O''Brien \\\\ Sons'");
  assert.equal(quoteValue('line one\nline two'), "'line one\\nline two'");
  assert.equal(quoteValue('₹684.15'), "'₹684.15'");
});

test('the export has the data but leaves out passwords and sign-in sessions', () => {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('secret-token', 1, 1)").run();
  db.prepare("INSERT INTO enquiries (name, phone, created_at) VALUES ('Kept Customer', '+91 90000 00000', 'now')").run();
  const sql = toMysql(db);

  assert.match(sql, /CREATE TABLE `bills`/);
  assert.match(sql, /Kept Customer/);
  assert.match(sql, /CREATE TABLE `users`/);
  assert.doesNotMatch(sql, /pass_hash|`salt`/);
  assert.doesNotMatch(sql, /CREATE TABLE `sessions`|secret-token/);
  assert.match(sql, /`key` VARCHAR\(191\) NOT NULL/);
  assert.match(sql, /DROP DATABASE IF EXISTS `safe_view_copy`/);
  assert.doesNotMatch(sql, /DROP DATABASE IF EXISTS `(?!safe_view_copy)/);
  db.close();
});
