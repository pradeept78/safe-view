// Money after a bill is approved: customer payments, vendor payments, shop expenses and investment.
// Approved bills stay locked; everything here sits beside them in separate tables.

const METHODS = ['cash', 'online'];
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function isValidDate(value) {
  const date = String(value ?? '');
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function registerAccountRoutes(app, { db, requireLogin, requireAdmin, Problem, text, now }) {
  const sum = (rows, key = 'amount') => round2(rows.reduce((total, row) => total + row[key], 0));

  function readDate(value) {
    if (!isValidDate(value)) throw new Problem(400, 'Enter a valid date');
    return value;
  }

  function readMoney(body) {
    const amount = round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Problem(400, 'Enter an amount more than zero');
    if (!METHODS.includes(body.method)) throw new Problem(400, 'Choose cash or online');
    return { date: readDate(body.date), amount, method: body.method, note: text(body.note, 300) };
  }

  function findProject(id) {
    const bill = db.prepare("SELECT * FROM bills WHERE id = ? AND status = 'approved' AND quote_status = 'won' AND superseded_by IS NULL").get(Number(id));
    if (!bill) throw new Problem(404, 'Project not found. A quotation becomes a project once it is won.');
    return bill;
  }

  const paymentsOf = (id) => db.prepare(`
    SELECT p.*, u.name AS created_by_name FROM payments p JOIN users u ON u.id = p.created_by
    WHERE p.bill_id = ? ORDER BY p.date, p.id`).all(id);
  const vendorPaymentsOf = (id) => db.prepare(`
    SELECT v.*, u.name AS created_by_name FROM vendor_payments v JOIN users u ON u.id = v.created_by
    WHERE v.bill_id = ? ORDER BY v.date, v.id`).all(id);

  function summarise(bill) {
    const totals = JSON.parse(bill.totals_json);
    const payments = paymentsOf(bill.id);
    const vendorPayments = vendorPaymentsOf(bill.id);
    const received = sum(payments);
    const vendorPaid = sum(vendorPayments);
    return {
      id: bill.id,
      number: bill.number,
      customerName: bill.customer_name,
      customerPhone: bill.customer_phone,
      approvedAt: bill.approved_at,
      acceptedOn: bill.order_accepted_on,
      orderValue: totals.basic,
      gst: round2(totals.cgst + totals.sgst),
      grandTotal: totals.grandTotal,
      received,
      cash: sum(payments.filter((p) => p.method === 'cash')),
      online: sum(payments.filter((p) => p.method === 'online')),
      balance: round2(totals.grandTotal - received),
      vendorPaid,
      // GST belongs to the government, so profit is worked out on the amount before tax.
      profit: round2(totals.basic - vendorPaid),
      payments,
      vendorPayments,
    };
  }

  app.get('/api/projects', requireLogin, (req, res) => {
    const bills = db.prepare("SELECT * FROM bills WHERE status = 'approved' AND quote_status = 'won' AND superseded_by IS NULL ORDER BY id DESC").all();
    res.json(bills.map((bill) => {
      const { payments, vendorPayments, ...summary } = summarise(bill);
      return summary;
    }));
  });

  app.get('/api/projects/:id', requireLogin, (req, res) => res.json(summarise(findProject(req.params.id))));

  app.put('/api/projects/:id/order', requireLogin, (req, res) => {
    const bill = findProject(req.params.id);
    const acceptedOn = req.body.acceptedOn ? readDate(req.body.acceptedOn) : null;
    db.prepare('UPDATE bills SET order_accepted_on = ? WHERE id = ?').run(acceptedOn, bill.id);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/payments', requireLogin, (req, res) => {
    const bill = findProject(req.params.id);
    const entry = readMoney(req.body);
    const { balance } = summarise(bill);
    if (entry.amount > balance) throw new Problem(400, `That is more than the balance of ₹${balance}`);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO payments (bill_id, date, amount, method, reference, note, created_by, created_at)
      VALUES (@billId, @date, @amount, @method, @reference, @note, @createdBy, @time)
    `).run({ ...entry, billId: bill.id, reference: text(req.body.reference, 80), createdBy: req.user.id, time: now() });
    res.status(201).json({ id: lastInsertRowid, createdBy: req.user.name });
  });

  app.post('/api/projects/:id/vendor-payments', requireLogin, (req, res) => {
    const bill = findProject(req.params.id);
    const vendor = text(req.body.vendor, 120);
    if (!vendor) throw new Problem(400, 'Enter the vendor name');
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO vendor_payments (bill_id, date, vendor, description, amount, method, note, created_by, created_at)
      VALUES (@billId, @date, @vendor, @description, @amount, @method, @note, @createdBy, @time)
    `).run({ ...readMoney(req.body), billId: bill.id, vendor, description: text(req.body.description, 200), createdBy: req.user.id, time: now() });
    res.status(201).json({ id: lastInsertRowid, createdBy: req.user.name });
  });

  app.get('/api/accounts', requireLogin, (req, res) => {
    const month = String(req.query.month ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Problem(400, 'Choose a month');
    const inMonth = `${month}-%`;
    const payments = db.prepare('SELECT * FROM payments WHERE date LIKE ?').all(inMonth);
    const vendorPayments = db.prepare('SELECT * FROM vendor_payments WHERE date LIKE ?').all(inMonth);
    const expenses = db.prepare(`
      SELECT e.*, u.name AS created_by_name FROM expenses e JOIN users u ON u.id = e.created_by
      WHERE e.date LIKE ? ORDER BY e.date DESC, e.id DESC`).all(inMonth);
    const byCategory = db.prepare(`
      SELECT category, ROUND(SUM(amount), 2) AS amount FROM expenses
      WHERE date LIKE ? GROUP BY category ORDER BY SUM(amount) DESC`).all(inMonth);
    const moneyIn = sum(payments);
    const vendorPaid = sum(vendorPayments);
    const expensesTotal = sum(expenses);
    res.json({
      month,
      cashIn: sum(payments.filter((p) => p.method === 'cash')),
      onlineIn: sum(payments.filter((p) => p.method === 'online')),
      moneyIn,
      vendorPaid,
      expensesTotal,
      leftOver: round2(moneyIn - vendorPaid - expensesTotal),
      byCategory,
      expenses,
    });
  });

  app.post('/api/expenses', requireLogin, (req, res) => {
    const category = text(req.body.category, 60);
    if (!category) throw new Problem(400, 'Choose or type a category');
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO expenses (date, category, description, amount, method, note, created_by, created_at)
      VALUES (@date, @category, @description, @amount, @method, @note, @createdBy, @time)
    `).run({ ...readMoney(req.body), category, description: text(req.body.description, 200), createdBy: req.user.id, time: now() });
    res.status(201).json({ id: lastInsertRowid });
  });

  app.get('/api/investments', requireLogin, (req, res) => {
    const entries = db.prepare(`
      SELECT i.*, u.name AS created_by_name FROM investments i JOIN users u ON u.id = i.created_by
      ORDER BY i.date DESC, i.id DESC`).all();
    res.json({
      total: sum(entries),
      byPerson: db.prepare('SELECT person, ROUND(SUM(amount), 2) AS amount FROM investments GROUP BY person ORDER BY SUM(amount) DESC').all(),
      byPurpose: db.prepare('SELECT paid_for AS paidFor, ROUND(SUM(amount), 2) AS amount FROM investments GROUP BY paid_for ORDER BY SUM(amount) DESC').all(),
      people: db.prepare('SELECT name FROM users WHERE active = 1 ORDER BY id').all().map((user) => user.name),
      entries,
    });
  });

  app.post('/api/investments', requireLogin, (req, res) => {
    const person = text(req.body.person, 80);
    const paidFor = text(req.body.paidFor, 200);
    if (!person) throw new Problem(400, 'Choose who paid');
    if (!paidFor) throw new Problem(400, 'Enter what this paid for');
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO investments (date, person, paid_for, amount, method, note, created_by, created_at)
      VALUES (@date, @person, @paidFor, @amount, @method, @note, @createdBy, @time)
    `).run({ ...readMoney(req.body), person, paidFor, createdBy: req.user.id, time: now() });
    res.status(201).json({ id: lastInsertRowid });
  });

  // Mistakes are removed by the admin only, so a partner cannot quietly change the books.
  for (const [path, table] of [['payments', 'payments'], ['vendor-payments', 'vendor_payments'], ['expenses', 'expenses'], ['investments', 'investments']]) {
    app.delete(`/api/${path}/:id`, requireLogin, requireAdmin, (req, res) => {
      const { changes } = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
      if (!changes) throw new Problem(404, 'Entry not found');
      res.json({ ok: true });
    });
  }
}

module.exports = { registerAccountRoutes, isValidDate };
