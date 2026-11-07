const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { calculateBill } = require('./calc');
const { hashPassword, checkPassword } = require('./db');
const { renderBill, renderMessage } = require('./print');
const { registerAccountRoutes } = require('./accounts');
const { registerQuotationRoutes } = require('./quotations');
const { registerUserRoutes } = require('./users');
const { registerBillActions } = require('./bill-actions');
const { registerActivity } = require('./activity');
const { registerOverview } = require('./overview');
const { createNotifier } = require('./notify');

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'sv_session';
const PUBLIC_SETTINGS = ['business_name', 'tagline', 'address', 'phone', 'whatsapp', 'email', 'opening_hours'];
const ADMIN_ONLY = 'Only the admin can do this';

const now = () => new Date().toISOString();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);

class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function rateLimiter(limit, windowMs) {
  const hits = new Map();
  const limiter = (req, res, next) => {
    const time = Date.now();
    const recent = (hits.get(req.ip) || []).filter((at) => time - at < windowMs);
    if (recent.length >= limit) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes, or ask your admin to reset your password.' });
    recent.push(time);
    hits.set(req.ip, recent);
    next();
  };
  limiter.clear = (ip) => hits.delete(ip);
  return limiter;
}

function readCookie(req) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

const CONTENT_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://images.unsplash.com",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function createApp(db, { limits = { login: 10, enquiry: 5 }, notify = createNotifier() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Only Caddy may say who the real visitor is. Without this, every visitor looks like one person
  // and the limits below would lock everyone out together. In Docker it sits on a private network.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Content-Security-Policy', CONTENT_POLICY);
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  const getSettings = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  const userName = (id) => (id ? db.prepare('SELECT name FROM users WHERE id = ?').get(id)?.name || '' : '');

  function currentUser(req) {
    const token = readCookie(req);
    if (!token) return null;
    return db.prepare(`
      SELECT u.id, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
    `).get(sha256(token), Date.now()) || null;
  }

  const requireLogin = (req, res, next) => {
    req.user = currentUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in' });
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ADMIN_ONLY });
    next();
  };

  const billNumber = (id) => (id ? db.prepare('SELECT number FROM bills WHERE id = ?').get(id)?.number ?? null : null);

  // Every approved version of this bill, oldest first.
  function billHistory(row) {
    const versions = [];
    let current = row;
    while (current.revises_id) {
      current = db.prepare('SELECT id, number, revises_id FROM bills WHERE id = ?').get(current.revises_id);
      if (!current) break;
      versions.unshift({ id: current.id, number: current.number });
    }
    let next = row.superseded_by;
    if (row.number) versions.push({ id: row.id, number: row.number, current: true });
    while (next) {
      const later = db.prepare('SELECT id, number, superseded_by FROM bills WHERE id = ?').get(next);
      if (!later) break;
      versions.push({ id: later.id, number: later.number });
      next = later.superseded_by;
    }
    return versions;
  }

  function presentBill(row) {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      customerName: row.customer_name,
      customerAddress: row.customer_address,
      customerPhone: row.customer_phone,
      customerGstin: row.customer_gstin,
      customerStateCode: row.customer_state_code,
      projectRemark: row.project_remark,
      allowanceMm: row.allowance_mm,
      gstPercent: row.gst_percent,
      lines: JSON.parse(row.lines_json),
      extras: JSON.parse(row.extras_json),
      totals: JSON.parse(row.totals_json),
      business: row.business_json ? JSON.parse(row.business_json) : null,
      returnNote: row.return_note,
      preparedBy: userName(row.prepared_by),
      preparedById: row.prepared_by,
      checkedBy: userName(row.checked_by),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at,
      quoteStatus: row.quote_status,
      lostReason: row.lost_reason,
      lostNote: row.lost_note,
      followUpOn: row.follow_up_on,
      acceptedOn: row.order_accepted_on,
      revisesId: row.revises_id,
      revisesNumber: billNumber(row.revises_id),
      supersededBy: row.superseded_by,
      supersededByNumber: billNumber(row.superseded_by),
      openRevisionId: db.prepare("SELECT id FROM bills WHERE revises_id = ? AND status <> 'approved'").get(row.id)?.id ?? null,
      history: billHistory(row),
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      invoiceStateCode: row.invoice_state_code,
      invoiceBusiness: row.invoice_business_json ? JSON.parse(row.invoice_business_json) : null,
    };
  }

  function findBill(id) {
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(Number(id));
    if (!row) throw new Problem(404, 'Bill not found');
    return row;
  }

  function readBillBody(body) {
    const customerName = text(body.customerName, 200);
    if (!customerName) throw new Problem(400, 'Customer name is required');
    const settings = getSettings();
    let calculated;
    try {
      calculated = calculateBill({
        lines: (Array.isArray(body.lines) ? body.lines : []).slice(0, 200).map((line) => ({
          shape: text(line.shape, 40) || 'BLOCK',
          glassName: text(line.glassName, 120),
          hsn: text(line.hsn, 20),
          thicknessMm: line.thicknessMm,
          widthMm: line.widthMm,
          heightMm: line.heightMm,
          qty: line.qty,
          rate: line.rate,
          gstPercent: line.gstPercent,
          listRate: line.listRate === '' || line.listRate === undefined ? null : Number(line.listRate),
          custom: Boolean(line.custom),
        })),
        extras: (Array.isArray(body.extras) ? body.extras : []).slice(0, 50).map((extra) => ({
          description: text(extra.description, 120),
          hsn: text(extra.hsn, 20),
          amount: extra.amount,
          gstPercent: extra.gstPercent,
        })),
        allowanceMm: body.allowanceMm ?? settings.default_allowance_mm,
        gstPercent: body.gstPercent ?? settings.default_gst_percent,
      });
    } catch (error) {
      throw new Problem(400, error.message);
    }
    if (calculated.lines.some((line) => !line.glassName)) throw new Problem(400, 'Choose or type a material on every line');
    return {
      customer_name: customerName,
      customer_address: text(body.customerAddress, 500),
      customer_phone: text(body.customerPhone, 30),
      customer_gstin: text(body.customerGstin, 20).toUpperCase(),
      customer_state_code: text(body.customerStateCode, 5),
      project_remark: text(body.projectRemark, 200),
      allowance_mm: Number(body.allowanceMm ?? settings.default_allowance_mm),
      gst_percent: Number(body.gstPercent ?? settings.default_gst_percent),
      lines_json: JSON.stringify(calculated.lines),
      extras_json: JSON.stringify(calculated.extras),
      totals_json: JSON.stringify(calculated.totals),
    };
  }

  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  const logActivity = registerActivity(app, { db, requireLogin, requireAdmin, now });

  // ----- Public website -----
  app.get('/api/public', (req, res) => {
    const settings = getSettings();
    res.json(Object.fromEntries(PUBLIC_SETTINGS.map((key) => [key, settings[key]])));
  });

  app.post('/api/enquiries', rateLimiter(limits.enquiry, 60 * 60 * 1000), (req, res) => {
    if (req.body.website) return res.status(201).json({ ok: true }); // hidden field only bots fill in
    const name = text(req.body.name, 120);
    const phone = text(req.body.phone, 30);
    if (!name) throw new Problem(400, 'Please enter your name');
    if (!/^[+\d][\d\s-]{6,}$/.test(phone)) throw new Problem(400, 'Please enter a valid phone number');
    const service = text(req.body.service, 80);
    const message = text(req.body.message, 2000);
    db.prepare('INSERT INTO enquiries (name, phone, service, message, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, phone, service, message, now());
    Promise.resolve(notify({ name, phone, service, message }))
      .catch((error) => console.error('Enquiry alert failed:', error.message));
    res.status(201).json({ ok: true });
  });

  // ----- Sign in -----
  const loginLimit = rateLimiter(limits.login, 15 * 60 * 1000);
  app.post('/api/login', loginLimit, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(text(req.body.username, 60).toLowerCase());
    if (!user || !user.active || !checkPassword(String(req.body.password ?? ''), user)) throw new Problem(401, 'Wrong username or password');
    loginLimit.clear(req.ip); // only wrong passwords should count toward the limit
    logActivity(user.name, 'Signed in');
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), user.id, Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_MS });
    res.json({ id: user.id, name: user.name, role: user.role, username: user.username });
  });

  app.post('/api/logout', (req, res) => {
    const token = readCookie(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/me', requireLogin, (req, res) => res.json(req.user));

  app.put('/api/me', requireLogin, (req, res) => {
    const name = text(req.body.name, 80);
    if (!name) throw new Problem(400, 'Name is required');
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    res.json({ ...req.user, name });
  });

  app.post('/api/password', requireLogin, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!checkPassword(String(req.body.currentPassword ?? ''), user)) throw new Problem(400, 'Current password is wrong');
    const next = String(req.body.newPassword ?? '');
    if (next.length < 8) throw new Problem(400, 'New password must have at least 8 characters');
    const { hash, salt } = hashPassword(next);
    db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, sha256(readCookie(req)));
    res.json({ ok: true });
  });

  // ----- Bills -----
  app.post('/api/preview', requireLogin, (req, res) => {
    try {
      res.json(calculateBill(req.body));
    } catch (error) {
      throw new Problem(400, error.message);
    }
  });

  const BILL_FILTERS = {
    all: 'superseded_by IS NULL',
    draft: "status = 'draft'",
    pending: "status = 'pending'",
    waiting: "status = 'approved' AND quote_status = 'waiting' AND superseded_by IS NULL",
    won: "status = 'approved' AND quote_status = 'won' AND superseded_by IS NULL",
    lost: "status = 'approved' AND quote_status = 'lost' AND superseded_by IS NULL",
    revised: 'superseded_by IS NOT NULL',
  };

  function billStats() {
    const count = (filter) => db.prepare(`SELECT COUNT(*) AS n FROM bills WHERE ${filter}`).get().n;
    const month = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
    const approved = db.prepare("SELECT totals_json FROM bills WHERE status = 'approved' AND superseded_by IS NULL AND approved_at LIKE ?").all(`${month}-%`);
    return {
      drafts: count(BILL_FILTERS.draft),
      waiting: count(BILL_FILTERS.pending),
      approvedThisMonth: approved.reduce((total, row) => total + (JSON.parse(row.totals_json).grandTotal || 0), 0),
    };
  }

  app.get('/api/bills', requireLogin, (req, res) => {
    const status = String(req.query.status || 'all');
    if (!BILL_FILTERS[status]) throw new Problem(400, 'Unknown status');
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = text(req.query.q, 80);
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = `${BILL_FILTERS[status]} AND (? = '' OR customer_name LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\'
      OR number LIKE ? ESCAPE '\\' OR invoice_number LIKE ? ESCAPE '\\')`;
    const params = [search, like, like, like, like];
    res.json({
      bills: db.prepare(`SELECT * FROM bills WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map(presentBill),
      total: db.prepare(`SELECT COUNT(*) AS n FROM bills WHERE ${where}`).get(...params).n,
      stats: billStats(),
    });
  });

  app.get('/api/bills/:id', requireLogin, (req, res) => res.json(presentBill(findBill(req.params.id))));

  app.post('/api/bills', requireLogin, (req, res) => {
    const bill = readBillBody(req.body);
    const time = now();
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO bills (status, customer_name, customer_address, customer_phone, customer_gstin, customer_state_code,
        project_remark, allowance_mm, gst_percent, lines_json, extras_json, totals_json, prepared_by, created_at, updated_at)
      VALUES ('draft', @customer_name, @customer_address, @customer_phone, @customer_gstin, @customer_state_code,
        @project_remark, @allowance_mm, @gst_percent, @lines_json, @extras_json, @totals_json, @prepared_by, @time, @time)
    `).run({ ...bill, prepared_by: req.user.id, time });
    res.status(201).json(presentBill(findBill(lastInsertRowid)));
  });

  app.put('/api/bills/:id', requireLogin, (req, res) => {
    const row = findBill(req.params.id);
    if (row.status === 'approved') throw new Problem(409, 'Approved bills are locked and cannot be changed');
    if (row.status === 'pending') throw new Problem(409, 'This bill is waiting for approval. The admin must send it back before it can be edited');
    db.prepare(`
      UPDATE bills SET customer_name = @customer_name, customer_address = @customer_address, customer_phone = @customer_phone,
        customer_gstin = @customer_gstin, customer_state_code = @customer_state_code, project_remark = @project_remark,
        allowance_mm = @allowance_mm, gst_percent = @gst_percent, lines_json = @lines_json, extras_json = @extras_json, totals_json = @totals_json,
        updated_at = @time WHERE id = @id
    `).run({ ...readBillBody(req.body), time: now(), id: row.id });
    res.json(presentBill(findBill(row.id)));
  });

  app.delete('/api/bills/:id', requireLogin, (req, res) => {
    const row = findBill(req.params.id);
    if (row.status !== 'draft') throw new Problem(409, 'Only drafts can be deleted');
    db.prepare('DELETE FROM bills WHERE id = ?').run(row.id);
    res.json({ ok: true });
  });

  app.post('/api/bills/:id/submit', requireLogin, (req, res) => {
    const row = findBill(req.params.id);
    if (row.status !== 'draft') throw new Problem(409, 'Only drafts can be sent for approval');
    db.prepare("UPDATE bills SET status = 'pending', return_note = '', updated_at = ? WHERE id = ?").run(now(), row.id);
    res.json(presentBill(findBill(row.id)));
  });

  app.post('/api/bills/:id/return', requireLogin, requireAdmin, (req, res) => {
    const row = findBill(req.params.id);
    if (row.status !== 'pending') throw new Problem(409, 'Only bills waiting for approval can be sent back');
    db.prepare("UPDATE bills SET status = 'draft', return_note = ?, updated_at = ? WHERE id = ?").run(text(req.body.note, 500), now(), row.id);
    res.json(presentBill(findBill(row.id)));
  });

  // The bill number and business details are fixed here, inside one transaction, so numbers
  // never skip or repeat and a later settings change cannot alter an approved bill.
  const approveBill = db.transaction((id, adminId) => {
    const row = findBill(id);
    if (row.status === 'approved') throw new Problem(409, 'This bill is already approved');
    const original = row.revises_id ? findBill(row.revises_id) : null;
    if (original?.invoice_number) throw new Problem(409, 'The original bill now has a tax invoice, so this revision cannot be approved');
    if (original?.superseded_by) throw new Problem(409, 'The original bill has already been replaced');
    const settings = getSettings();
    const next = Number(settings.next_bill_number);
    const time = now();
    db.prepare(`
      UPDATE bills SET status = 'approved', number = ?, checked_by = ?, business_json = ?, return_note = '',
        approved_at = ?, updated_at = ? WHERE id = ?
    `).run(`PI/${String(next).padStart(5, '0')}`, adminId, JSON.stringify(settings), time, time, row.id);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'next_bill_number'").run(String(next + 1));
    if (original) {
      // The corrected bill takes over the order, so payments and costs follow it.
      db.prepare('UPDATE bills SET quote_status = ?, order_accepted_on = ?, follow_up_on = ?, project_status = ?, completed_on = ? WHERE id = ?')
        .run(original.quote_status, original.order_accepted_on, original.follow_up_on, original.project_status, original.completed_on, row.id);
      db.prepare('UPDATE payments SET bill_id = ? WHERE bill_id = ?').run(row.id, original.id);
      db.prepare('UPDATE vendor_payments SET bill_id = ? WHERE bill_id = ?').run(row.id, original.id);
      db.prepare('UPDATE vendor_bills SET bill_id = ? WHERE bill_id = ?').run(row.id, original.id);
      db.prepare('UPDATE bills SET superseded_by = ?, follow_up_on = NULL WHERE id = ?').run(row.id, original.id);
    }
  });

  app.post('/api/bills/:id/approve', requireLogin, requireAdmin, (req, res) => {
    approveBill(req.params.id, req.user.id);
    res.json(presentBill(findBill(req.params.id)));
  });

  app.get('/print/:id', (req, res) => {
    if (!currentUser(req)) return res.status(401).send(renderMessage('Please sign in to the dashboard first.'));
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).send(renderMessage('Bill not found.'));
    if (row.status !== 'approved') return res.status(403).send(renderMessage('This bill cannot be printed until the admin approves it.'));
    res.send(renderBill(presentBill(row)));
  });

  app.get('/print/:id/tax-invoice', (req, res) => {
    if (!currentUser(req)) return res.status(401).send(renderMessage('Please sign in to the dashboard first.'));
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(Number(req.params.id));
    if (!row?.invoice_number) return res.status(404).send(renderMessage('This order does not have a tax invoice yet.'));
    res.send(renderBill(presentBill(row), { invoice: true }));
  });

  // ----- Settings and glass rates -----
  app.get('/api/settings', requireLogin, (req, res) => res.json(getSettings()));

  app.put('/api/settings', requireLogin, requireAdmin, (req, res) => {
    const current = getSettings();
    const update = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    const next = Number(req.body.next_bill_number ?? current.next_bill_number);
    if (!Number.isInteger(next) || next < 1) throw new Problem(400, 'Next bill number must be a whole number');
    const used = db.prepare("SELECT COUNT(*) AS n FROM bills WHERE number = ?").get(`PI/${String(next).padStart(5, '0')}`).n;
    if (used) throw new Problem(400, 'That bill number has already been used');
    db.transaction(() => {
      for (const key of Object.keys(current)) {
        if (key in req.body) update.run(text(req.body[key], 3000), key);
      }
    })();
    res.json(getSettings());
  });

  app.get('/api/glass-types', requireLogin, (req, res) => {
    res.json(db.prepare('SELECT * FROM glass_types WHERE active = 1 ORDER BY thickness_mm, name').all());
  });

  function readGlass(body) {
    const glass = {
      name: text(body.name, 120),
      hsn: text(body.hsn, 20),
      thickness_mm: Number(body.thickness_mm),
      rate: body.rate === '' ? NaN : Number(body.rate),
      gst_percent: body.gst_percent === '' ? NaN : Number(body.gst_percent),
    };
    if (!glass.name) throw new Problem(400, 'Glass name is required');
    if (!(glass.thickness_mm > 0)) throw new Problem(400, 'Thickness must be more than zero');
    if (!(glass.rate >= 0)) throw new Problem(400, 'Enter a rate that is not negative');
    if (!(glass.gst_percent >= 0 && glass.gst_percent <= 100)) throw new Problem(400, 'Enter a GST % between 0 and 100');
    return glass;
  }

  app.post('/api/glass-types', requireLogin, requireAdmin, (req, res) => {
    const { lastInsertRowid } = db.prepare('INSERT INTO glass_types (name, hsn, thickness_mm, rate, gst_percent) VALUES (@name, @hsn, @thickness_mm, @rate, @gst_percent)').run(readGlass(req.body));
    res.status(201).json(db.prepare('SELECT * FROM glass_types WHERE id = ?').get(lastInsertRowid));
  });

  app.put('/api/glass-types/:id', requireLogin, requireAdmin, (req, res) => {
    db.prepare('UPDATE glass_types SET name = @name, hsn = @hsn, thickness_mm = @thickness_mm, rate = @rate, gst_percent = @gst_percent WHERE id = @id')
      .run({ ...readGlass(req.body), id: Number(req.params.id) });
    res.json({ ok: true });
  });

  app.delete('/api/glass-types/:id', requireLogin, requireAdmin, (req, res) => {
    db.prepare('UPDATE glass_types SET active = 0 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ----- Enquiries -----
  app.get('/api/enquiries', requireLogin, (req, res) => {
    res.json(db.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 500').all());
  });

  app.put('/api/enquiries/:id', requireLogin, (req, res) => {
    if (!['new', 'contacted', 'closed'].includes(req.body.status)) throw new Problem(400, 'Unknown status');
    db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(req.body.status, Number(req.params.id));
    res.json({ ok: true });
  });

  registerAccountRoutes(app, { db, requireLogin, requireAdmin, Problem, text, now });
  registerQuotationRoutes(app, { db, requireLogin, Problem, text });
  registerUserRoutes(app, { db, requireLogin, requireAdmin, Problem, text });
  registerOverview(app, { db, requireLogin });
  registerBillActions(app, { db, requireLogin, requireAdmin, Problem, text, now, presentBill, getSettings });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((error, req, res, next) => {
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

module.exports = { createApp };
