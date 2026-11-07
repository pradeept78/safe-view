// What the customer decided about an approved bill. Admin approval only means it can be sent:
// it becomes a project when it is won, and stays out of the project totals if it is lost.

const { isValidDate } = require('./accounts');

const LOST_REASONS = [
  'Price too high',
  'Chose another vendor',
  'Delivery time too long',
  'Project postponed',
  'Customer stopped responding',
  'Other',
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const indiaDate = (iso) => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function registerQuotationRoutes(app, { db, requireLogin, Problem, text }) {
  function findQuotation(id) {
    const bill = db.prepare("SELECT * FROM bills WHERE id = ? AND status = 'approved'").get(Number(id));
    if (!bill) throw new Problem(404, 'Quotation not found. Only approved bills can be sent to customers.');
    return bill;
  }

  function readDate(value, message) {
    if (!isValidDate(value)) throw new Problem(400, message);
    return value;
  }

  function requireWaiting(bill) {
    if (bill.quote_status !== 'waiting') throw new Problem(409, 'Reopen this quotation before changing the result');
  }

  app.put('/api/quotations/:id/won', requireLogin, (req, res) => {
    const bill = findQuotation(req.params.id);
    requireWaiting(bill);
    const acceptedOn = readDate(req.body.acceptedOn, 'Enter the date the order was accepted');
    db.prepare("UPDATE bills SET quote_status = 'won', order_accepted_on = ?, follow_up_on = NULL WHERE id = ?").run(acceptedOn, bill.id);
    res.json({ ok: true });
  });

  app.put('/api/quotations/:id/lost', requireLogin, (req, res) => {
    const bill = findQuotation(req.params.id);
    requireWaiting(bill);
    const reason = text(req.body.reason, 60);
    const note = text(req.body.note, 300);
    if (!LOST_REASONS.includes(reason)) throw new Problem(400, 'Choose why this order was lost');
    if (reason === 'Other' && !note) throw new Problem(400, 'Add a note explaining why it was lost');
    db.prepare("UPDATE bills SET quote_status = 'lost', lost_reason = ?, lost_note = ?, follow_up_on = NULL WHERE id = ?").run(reason, note, bill.id);
    res.json({ ok: true });
  });

  app.put('/api/quotations/:id/reopen', requireLogin, (req, res) => {
    const bill = findQuotation(req.params.id);
    const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE bill_id = ?`).get(bill.id).n;
    if (count('payments') || count('vendor_payments')) {
      throw new Problem(409, 'This project has payments recorded. Ask the admin to delete them before reopening it.');
    }
    db.prepare("UPDATE bills SET quote_status = 'waiting', order_accepted_on = NULL, lost_reason = '', lost_note = '' WHERE id = ?").run(bill.id);
    res.json({ ok: true });
  });

  app.put('/api/quotations/:id/follow-up', requireLogin, (req, res) => {
    const bill = findQuotation(req.params.id);
    requireWaiting(bill);
    const followUpOn = req.body.followUpOn ? readDate(req.body.followUpOn, 'Enter a valid follow-up date') : null;
    db.prepare('UPDATE bills SET follow_up_on = ? WHERE id = ?').run(followUpOn, bill.id);
    res.json({ ok: true });
  });

  app.get('/api/quotation-reasons', requireLogin, (req, res) => res.json(LOST_REASONS));

  app.get('/api/quotations', requireLogin, (req, res) => {
    const from = readDate(req.query.from, 'Choose a start date');
    const to = readDate(req.query.to, 'Choose an end date');

    const approved = db.prepare("SELECT * FROM bills WHERE status = 'approved' ORDER BY id DESC").all().map((bill) => ({
      id: bill.id,
      number: bill.number,
      customerName: bill.customer_name,
      customerPhone: bill.customer_phone,
      sentOn: indiaDate(bill.approved_at),
      status: bill.quote_status,
      lostReason: bill.lost_reason,
      lostNote: bill.lost_note,
      followUpOn: bill.follow_up_on,
      value: JSON.parse(bill.totals_json).basic || 0,
    }));
    const inRange = approved.filter((quote) => quote.sentOn >= from && quote.sentOn <= to);
    const having = (status) => inRange.filter((quote) => quote.status === status);
    const value = (quotes) => round2(quotes.reduce((total, quote) => total + quote.value, 0));

    const won = having('won');
    const lost = having('lost');
    const waiting = having('waiting');
    const decided = won.length + lost.length;

    const reasons = new Map();
    for (const quote of lost) {
      const entry = reasons.get(quote.lostReason) || { reason: quote.lostReason, count: 0, value: 0 };
      entry.count += 1;
      entry.value = round2(entry.value + quote.value);
      reasons.set(quote.lostReason, entry);
    }

    res.json({
      sent: inRange.length,
      won: won.length,
      lost: lost.length,
      waiting: waiting.length,
      winRate: decided ? Math.round((won.length / decided) * 100) : null,
      valueWon: value(won),
      valueLost: value(lost),
      valueWaiting: value(waiting),
      lostReasons: [...reasons.values()].sort((a, b) => b.count - a.count || b.value - a.value),
      // Follow-ups ignore the chosen dates, so an old quotation that needs a call is never hidden.
      followUps: approved
        .filter((quote) => quote.status === 'waiting' && quote.followUpOn)
        .sort((a, b) => a.followUpOn.localeCompare(b.followUpOn)),
      quotations: inRange,
      reasons: LOST_REASONS,
    });
  });
}

module.exports = { registerQuotationRoutes, LOST_REASONS };
