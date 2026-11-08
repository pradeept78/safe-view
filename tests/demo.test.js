const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { buildDemo } = require('../scripts/seed-demo');

test('the demo builds a full year of activity through the real app', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-view-'));
  const file = path.join(dir, 'demo.db');
  await buildDemo(file);
  const db = new Database(file, { readonly: true });
  const count = (sql) => db.prepare(sql).get().n;
  assert.ok(count("SELECT COUNT(*) AS n FROM bills WHERE quote_status = 'won' AND superseded_by IS NULL") >= 20);
  assert.ok(count("SELECT COUNT(*) AS n FROM bills WHERE quote_status = 'lost'") >= 5);
  assert.ok(count("SELECT COUNT(*) AS n FROM bills WHERE status = 'draft'") >= 2);
  assert.ok(count('SELECT COUNT(DISTINCT substr(order_accepted_on, 1, 7)) AS n FROM bills WHERE order_accepted_on IS NOT NULL') >= 6);
  assert.ok(count('SELECT COUNT(*) AS n FROM vendor_payments WHERE vendor_bill_id IS NULL') === 0);
  assert.ok(count('SELECT COUNT(*) AS n FROM bills WHERE invoice_number IS NOT NULL') >= 1);
  assert.ok(count('SELECT COUNT(*) AS n FROM expenses') >= 24);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the demo refuses to touch a file that is not a demo, or run in production', async () => {
  await assert.rejects(buildDemo(path.join(os.tmpdir(), 'safe-view.db')), /must contain "demo"/);
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(buildDemo(path.join(os.tmpdir(), 'demo.db')), /not the live server/);
  } finally {
    process.env.NODE_ENV = before;
  }
});
