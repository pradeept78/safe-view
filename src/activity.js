// A record of who changed what. It stores a plain description only, never request bodies,
// so passwords and other private fields cannot end up here.

const RULES = [
  ['POST', /^\/api\/bills$/, 'Created a bill'],
  ['PUT', /^\/api\/bills\/\d+$/, 'Edited a bill'],
  ['DELETE', /^\/api\/bills\/\d+$/, 'Deleted a draft'],
  ['POST', /^\/api\/bills\/\d+\/submit$/, 'Sent a bill for approval'],
  ['POST', /^\/api\/bills\/\d+\/approve$/, 'Approved a bill'],
  ['POST', /^\/api\/bills\/\d+\/return$/, 'Sent a bill back'],
  ['POST', /^\/api\/bills\/\d+\/revise$/, 'Started a bill revision'],
  ['POST', /^\/api\/bills\/\d+\/tax-invoice$/, 'Created a tax invoice'],
  ['PUT', /^\/api\/quotations\/\d+\/won$/, 'Marked an order as won'],
  ['PUT', /^\/api\/quotations\/\d+\/lost$/, 'Marked an order as lost'],
  ['PUT', /^\/api\/quotations\/\d+\/reopen$/, 'Reopened a quotation'],
  ['PUT', /^\/api\/quotations\/\d+\/follow-up$/, 'Set a follow-up date'],
  ['PUT', /^\/api\/projects\/\d+\/order$/, 'Changed an order date'],
  ['POST', /^\/api\/projects\/\d+\/payments$/, 'Added a customer payment'],
  ['POST', /^\/api\/projects\/\d+\/vendor-payments$/, 'Paid a project cost'],
  ['POST', /^\/api\/projects\/\d+\/vendor-bills$/, 'Added a project cost'],
  ['PUT', /^\/api\/projects\/\d+\/status$/, 'Changed a project status'],
  ['DELETE', /^\/api\/vendor-bills\/\d+$/, 'Deleted a project cost'],
  ['DELETE', /^\/api\/payments\/\d+$/, 'Deleted a customer payment'],
  ['DELETE', /^\/api\/vendor-payments\/\d+$/, 'Deleted a project cost payment'],
  ['POST', /^\/api\/expenses$/, 'Added an expense'],
  ['DELETE', /^\/api\/expenses\/\d+$/, 'Deleted an expense'],
  ['POST', /^\/api\/investments$/, 'Added an investment'],
  ['DELETE', /^\/api\/investments\/\d+$/, 'Deleted an investment'],
  ['POST', /^\/api\/glass-types$/, 'Added a material'],
  ['PUT', /^\/api\/glass-types\/\d+$/, 'Changed a material or rate'],
  ['DELETE', /^\/api\/glass-types\/\d+$/, 'Removed a material'],
  ['PUT', /^\/api\/settings$/, 'Changed settings'],
  ['POST', /^\/api\/users$/, 'Added a user'],
  ['PUT', /^\/api\/users\/\d+$/, 'Changed a user'],
  ['POST', /^\/api\/users\/\d+\/password$/, 'Reset a password'],
  ['POST', /^\/api\/password$/, 'Changed own password'],
  ['PUT', /^\/api\/me$/, 'Changed own name'],
  ['PUT', /^\/api\/enquiries\/\d+$/, 'Updated an enquiry'],
];

function registerActivity(app, { db, requireLogin, requireAdmin, now }) {
  function record(who, action, detail = '') {
    db.prepare('INSERT INTO activity_log (who, action, detail, created_at) VALUES (?, ?, ?, ?)')
      .run(who, action, String(detail).slice(0, 200), now());
  }

  function describe(path, req) {
    const bill = path.match(/^\/api\/(?:bills|quotations|projects)\/(\d+)/);
    if (bill) {
      const row = db.prepare('SELECT number, customer_name FROM bills WHERE id = ?').get(Number(bill[1]));
      return row ? `${row.number || `Draft ${bill[1]}`} · ${row.customer_name}` : `Bill ${bill[1]}`;
    }
    if (path === '/api/bills') return String(req.body?.customerName ?? '');
    const user = path.match(/^\/api\/users\/(\d+)/);
    if (user) return db.prepare('SELECT username FROM users WHERE id = ?').get(Number(user[1]))?.username ?? '';
    if (path === '/api/users') return String(req.body?.username ?? '');
    return '';
  }

  app.use('/api', (req, res, next) => {
    const path = req.originalUrl.split('?')[0];
    const rule = RULES.find(([method, pattern]) => method === req.method && pattern.test(path));
    if (rule) {
      res.on('finish', () => {
        if (res.statusCode >= 400 || !req.user) return;
        try {
          record(req.user.name, rule[2], res.locals.activityDetail || describe(path, req));
        } catch (error) {
          console.error('Could not save activity', error.message);
        }
      });
    }
    next();
  });

  app.get('/api/activity', requireLogin, requireAdmin, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json({
      entries: db.prepare('SELECT id, who, action, detail, created_at FROM activity_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset),
      total: db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,
    });
  });

  return record;
}

module.exports = { registerActivity };
