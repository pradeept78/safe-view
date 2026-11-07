const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_SETTINGS = {
  business_name: 'Safe View Glass Solutions',
  tagline: 'Clear Vision. Stronger Spaces.',
  address: '',
  gstin: '',
  phone: '',
  whatsapp: '',
  email: '',
  opening_hours: '',
  bank_name: '',
  bank_account: '',
  bank_ifsc: '',
  bank_branch: '',
  jurisdiction: '',
  default_allowance_mm: '50',
  default_gst_percent: '18',
  next_bill_number: '1',
  terms: [
    'Validity of PI: 10 Days',
    'Unloading by: Buyer',
    'Packing Type: Will Be Extra If Applicable',
    'Delivery Period: 4-5 Days for single glass, 6-7 days for DGU & Security Glass',
    'Freight: Above Price is Ex-Factory & Freight will be Extra',
    'Please check PI & Annexure I and provide your approval. After approval, order will be processed & then no dispute will be entertained.',
    'Payment 100% Advance',
  ].join('\n'),
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function checkPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex'));
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'partner')),
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS glass_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      hsn TEXT NOT NULL DEFAULT '',
      thickness_mm REAL NOT NULL,
      rate REAL NOT NULL,
      gst_percent REAL NOT NULL DEFAULT 18,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY,
      number TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'approved')),
      customer_name TEXT NOT NULL,
      customer_address TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      customer_gstin TEXT NOT NULL DEFAULT '',
      customer_state_code TEXT NOT NULL DEFAULT '',
      project_remark TEXT NOT NULL DEFAULT '',
      allowance_mm REAL NOT NULL,
      gst_percent REAL NOT NULL,
      lines_json TEXT NOT NULL,
      extras_json TEXT NOT NULL DEFAULT '[]',
      totals_json TEXT NOT NULL,
      business_json TEXT,
      return_note TEXT NOT NULL DEFAULT '',
      prepared_by INTEGER NOT NULL REFERENCES users(id),
      checked_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
      created_at TEXT NOT NULL
    );
  `);

  // Databases made before these columns existed get them here, keeping all their data.
  const hasColumn = (table, name) => db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
  if (!hasColumn('glass_types', 'gst_percent')) db.exec('ALTER TABLE glass_types ADD COLUMN gst_percent REAL NOT NULL DEFAULT 18');
  if (!hasColumn('bills', 'extras_json')) db.exec("ALTER TABLE bills ADD COLUMN extras_json TEXT NOT NULL DEFAULT '[]'");
}

function seed(db, firstLoginFile) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

  if (db.prepare('SELECT COUNT(*) AS n FROM glass_types').get().n === 0) {
    db.prepare('INSERT INTO glass_types (name, hsn, thickness_mm, rate) VALUES (?, ?, ?, ?)')
      .run('5MM CLEAR TOUGHENED GLASS', '70071100', 5, 684.15);
  }

  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  const insertUser = db.prepare('INSERT INTO users (username, name, role, pass_hash, salt) VALUES (?, ?, ?, ?, ?)');
  const logins = [['admin', 'Admin', 'admin'], ['partner2', 'Partner 2', 'partner'], ['partner3', 'Partner 3', 'partner']]
    .map(([username, name, role]) => {
      const password = crypto.randomBytes(9).toString('base64url');
      const { hash, salt } = hashPassword(password);
      insertUser.run(username, name, role, hash, salt);
      return `${username}  ${password}`;
    });
  if (firstLoginFile) {
    fs.writeFileSync(firstLoginFile, `Safe View first logins. Change these after signing in, then delete this file.\n\n${logins.join('\n')}\n`, { mode: 0o600 });
  }
}

function openDatabase(file, firstLoginFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  seed(db, firstLoginFile);
  return db;
}

module.exports = { openDatabase, hashPassword, checkPassword };
