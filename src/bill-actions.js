// Things done to an approved bill: correcting it with a revision, and issuing a tax invoice.
// Approved bills stay locked. A revision is a new bill that replaces the old one when it is approved.

const { isValidDate } = require('./accounts');

// Indian financial years run April to March, and invoice numbers restart each year.
function financialYear(date) {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

function registerBillActions(app, { db, requireLogin, requireAdmin, Problem, text, now, presentBill, getSettings }) {
  function findBill(id) {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(Number(id));
    if (!bill) throw new Problem(404, 'Bill not found');
    return bill;
  }

  const openRevision = (id) => db.prepare('SELECT id FROM bills WHERE revises_id = ? AND status <> ?').get(id, 'approved');

  app.post('/api/bills/:id/revise', requireLogin, (req, res) => {
    const bill = findBill(req.params.id);
    if (bill.status !== 'approved') throw new Problem(409, 'Only approved bills need revising. Edit this draft instead.');
    if (bill.superseded_by) throw new Problem(409, 'This bill has already been replaced');
    if (bill.invoice_number) throw new Problem(409, 'A tax invoice has been issued, so this bill can no longer be revised. Ask your accountant about a credit note.');
    if (bill.quote_status === 'lost') throw new Problem(409, 'Reopen this quotation before revising it');
    if (openRevision(bill.id)) throw new Problem(409, 'This bill already has a revision in progress');

    const time = now();
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO bills (status, customer_name, customer_address, customer_phone, customer_gstin, customer_state_code,
        project_remark, allowance_mm, gst_percent, lines_json, extras_json, totals_json, prepared_by, created_at, updated_at, revises_id)
      VALUES ('draft', @customer_name, @customer_address, @customer_phone, @customer_gstin, @customer_state_code,
        @project_remark, @allowance_mm, @gst_percent, @lines_json, @extras_json, @totals_json, @user, @time, @time, @id)
    `).run({ ...bill, user: req.user.id, time });
    res.status(201).json(presentBill(findBill(lastInsertRowid)));
  });

  const issueInvoice = db.transaction((bill, date, stateCode, business) => {
    const fy = financialYear(date);
    const { last } = db.prepare('SELECT MAX(invoice_seq) AS last FROM bills WHERE invoice_fy = ?').get(fy);
    const seq = (last || 0) + 1;
    db.prepare(`
      UPDATE bills SET invoice_number = ?, invoice_date = ?, invoice_state_code = ?, invoice_fy = ?, invoice_seq = ?, invoice_business_json = ?
      WHERE id = ?
    `).run(`SV/${fy}/${String(seq).padStart(5, '0')}`, date, stateCode, fy, seq, JSON.stringify(business), bill.id);
  });

  app.post('/api/bills/:id/tax-invoice', requireLogin, requireAdmin, (req, res) => {
    const bill = findBill(req.params.id);
    if (bill.status !== 'approved' || bill.superseded_by || bill.quote_status !== 'won') {
      throw new Problem(409, 'A tax invoice can only be made for a won order');
    }
    if (bill.invoice_number) throw new Problem(409, 'This order already has a tax invoice');
    if (openRevision(bill.id)) throw new Problem(409, 'Finish or delete the revision of this bill first');

    const date = req.body.date;
    if (!isValidDate(date)) throw new Problem(400, 'Enter the invoice date');
    if (date > new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)) {
      throw new Problem(400, 'The invoice date cannot be in the future');
    }
    const stateCode = text(req.body.stateCode, 2);
    if (!/^\d{2}$/.test(stateCode)) throw new Problem(400, 'Enter the 2-digit state code for the place of supply');

    const business = getSettings();
    if (!business.gstin || !business.address) throw new Problem(400, 'Add your GST number and address in Settings first');

    issueInvoice(bill, date, stateCode, business);
    res.status(201).json(presentBill(findBill(bill.id)));
  });
}

module.exports = { registerBillActions };
