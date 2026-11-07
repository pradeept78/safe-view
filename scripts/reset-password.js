// Emergency sign-in recovery, for when nobody can reach the Users page.
//   node scripts/reset-password.js admin
// It sets a new random password, shows it once, and signs that user out everywhere.

const crypto = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3');
const { hashPassword } = require('../src/db');

function resetPassword(db, username) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(String(username ?? '').trim().toLowerCase());
  if (!user) return null;
  const password = crypto.randomBytes(9).toString('base64url');
  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?, active = 1 WHERE id = ?').run(hash, salt, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  return password;
}

if (require.main === module) {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node scripts/reset-password.js USERNAME');
    process.exit(1);
  }
  const db = new Database(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'safe-view.db'), { fileMustExist: true });
  const password = resetPassword(db, username);
  const names = db.prepare('SELECT username FROM users ORDER BY id').all().map((user) => user.username);
  db.close();
  if (!password) {
    console.error(`No user called "${username}". Usernames: ${names.join(', ')}`);
    process.exit(1);
  }
  console.log(`New password for ${username}: ${password}`);
  console.log('Sign in, then change it under My Account.');
}

module.exports = { resetPassword };
