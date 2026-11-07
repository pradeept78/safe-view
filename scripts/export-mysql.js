// Turns a copy of the Safe View data into a .sql file that MySQL Workbench can import.
// This is a one-way copy for viewing and reports. The app itself keeps using SQLite.
//   node scripts/export-mysql.js [database file] [output file]

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA = 'safe_view_copy';
const SKIP_TABLES = new Set(['sessions']);
const SKIP_COLUMNS = { users: new Set(['pass_hash', 'salt']) };

const quoteName = (name) => `\`${name.replace(/`/g, '``')}\``;

function quoteValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0')
    .replace(/\x1a/g, '\\Z');
  return `'${escaped}'`;
}

function columnType(column) {
  const type = column.type.toUpperCase();
  if (type.includes('INT')) return 'BIGINT';
  if (type.includes('REAL')) return 'DOUBLE';
  return column.pk ? 'VARCHAR(191)' : 'LONGTEXT';
}

function toMysql(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map((table) => table.name)
    .filter((name) => !SKIP_TABLES.has(name));

  const out = [
    '-- Safe View data copy for viewing and reports. Changes here do not reach the app.',
    `DROP DATABASE IF EXISTS ${quoteName(SCHEMA)};`,
    `CREATE DATABASE ${quoteName(SCHEMA)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `USE ${quoteName(SCHEMA)};`,
    "SET NAMES utf8mb4;",
    '',
  ];

  for (const table of tables) {
    const skip = SKIP_COLUMNS[table] || new Set();
    const columns = db.prepare(`PRAGMA table_info(${quoteName(table)})`).all().filter((column) => !skip.has(column.name));
    const keys = columns.filter((column) => column.pk).map((column) => quoteName(column.name));
    const definitions = columns.map((column) => `  ${quoteName(column.name)} ${columnType(column)}${column.pk ? ' NOT NULL' : ' NULL'}`);
    if (keys.length) definitions.push(`  PRIMARY KEY (${keys.join(', ')})`);
    out.push(`CREATE TABLE ${quoteName(table)} (\n${definitions.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    const names = columns.map((column) => quoteName(column.name));
    for (const row of db.prepare(`SELECT ${names.map((name) => `"${name.slice(1, -1)}"`).join(', ')} FROM ${quoteName(table)}`).all()) {
      const values = columns.map((column) => quoteValue(row[column.name]));
      out.push(`INSERT INTO ${quoteName(table)} (${names.join(', ')}) VALUES (${values.join(', ')});`);
    }
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

if (require.main === module) {
  const input = process.argv[2] || path.join(__dirname, '..', 'data', 'safe-view.db');
  const output = process.argv[3] || path.join(path.dirname(input), 'safe-view-mysql.sql');
  const db = new Database(input, { readonly: true, fileMustExist: true });
  fs.writeFileSync(output, toMysql(db), { mode: 0o600 });
  db.close();
  console.log(`MySQL file saved: ${output}`);
}

module.exports = { toMysql, quoteValue };
