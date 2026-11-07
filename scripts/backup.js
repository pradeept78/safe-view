// Makes a safe copy of the database while the app keeps running, then removes old copies.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const BACKUP_NAME = /^safe-view-\d{4}-\d{2}-\d{2}\.db$/;

async function backupDatabase({ dbFile, backupDir, keepDays = 14 }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `safe-view-${new Date().toISOString().slice(0, 10)}.db`);
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  const oldest = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(backupDir)) {
    const file = path.join(backupDir, name);
    if (BACKUP_NAME.test(name) && file !== target && fs.statSync(file).mtimeMs < oldest) fs.rmSync(file);
  }
  return target;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  backupDatabase({
    dbFile: process.env.DB_FILE || path.join(root, 'data', 'safe-view.db'),
    backupDir: process.env.BACKUP_DIR || path.join(root, 'backups'),
    keepDays: Number(process.env.BACKUP_KEEP_DAYS) || 14,
  }).then((target) => console.log(`Backup saved: ${target}`)).catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { backupDatabase };
