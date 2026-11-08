// Turns the shop's records into a few plain findings: who owes money and for how long, the best
// customers, the best-selling glass and where project money goes. It only reads, never changes data.
const { calculateBill } = require('./calc');

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const indiaDate = (time = Date.now()) => new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));
const rupees = (value) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const key = (name) => String(name || '').trim().toLowerCase();
const AGE_BANDS = [
  { band: 'fresh', label: '0–30 days', tone: 'green', max: 30 },
  { band: 'late', label: '31–60 days', tone: 'amber', max: 60 },
  { band: 'old', label: 'Over 60 days', tone: 'red', max: Infinity },
];
const TOP = 8;

function registerInsights(app, { db, requireLogin }) {
  app.get('/api/insights', requireLogin, (req, res) => {
    const today = indiaDate();
    const sumOf = (sql, id) => db.prepare(sql).get(id).amount || 0;
    const orders = db.prepare(`
      SELECT * FROM bills WHERE status = 'approved' AND quote_status = 'won' AND superseded_by IS NULL
    `).all().map((bill) => {
      const totals = JSON.parse(bill.totals_json);
      const received = sumOf('SELECT SUM(amount) AS amount FROM payments WHERE bill_id = ?', bill.id);
      const since = bill.order_accepted_on || indiaDate(Date.parse(bill.approved_at));
      return {
        id: bill.id,
        number: bill.number,
        customer: bill.customer_name,
        phone: bill.customer_phone,
        value: totals.basic || 0,
        balance: round2((totals.grandTotal || 0) - received),
        since,
        days: daysBetween(since, today),
        bill,
      };
    });

    // Money owed, oldest first, in three age bands.
    const owed = orders.filter((order) => order.balance > 0).sort((a, b) => b.days - a.days || b.balance - a.balance);
    const aging = AGE_BANDS.map(({ band, label, tone, max }, index) => {
      const min = index ? AGE_BANDS[index - 1].max : -1;
      const list = owed.filter((order) => order.days > min && order.days <= max);
      return { band, label, tone, count: list.length, amount: round2(list.reduce((sum, order) => sum + order.balance, 0)) };
    });

    // Customers are matched by name, so the same person on several bills counts once.
    const customers = new Map();
    for (const order of [...orders].sort((a, b) => a.id - b.id)) {
      const entry = customers.get(key(order.customer)) || { name: order.customer, orders: 0, value: 0, latestId: order.id };
      Object.assign(entry, { name: order.customer.trim(), orders: entry.orders + 1, value: round2(entry.value + order.value), latestId: order.id });
      customers.set(key(order.customer), entry);
    }
    const topCustomers = [...customers.values()].sort((a, b) => b.value - a.value).slice(0, TOP);

    // Glass sold, worked out again from each bill so manual rates and sizes are counted exactly.
    const glass = new Map();
    for (const { bill } of orders) {
      const { lines } = calculateBill({
        allowanceMm: bill.allowance_mm, gstPercent: bill.gst_percent, lines: JSON.parse(bill.lines_json), extras: JSON.parse(bill.extras_json || '[]'),
      });
      for (const line of lines) {
        const entry = glass.get(key(line.glassName)) || { name: line.glassName, areaSqm: 0, value: 0, bills: new Set() };
        entry.areaSqm += line.areaSqm;
        entry.value += line.amount;
        entry.bills.add(bill.id);
        glass.set(key(line.glassName), entry);
      }
    }
    const materials = [...glass.values()]
      .map(({ name, areaSqm, value, bills }) => ({ name, areaSqm: Math.round(areaSqm * 100) / 100, value: round2(value), bills: bills.size }))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP);

    // Who the shop pays most for its projects.
    const vendors = db.prepare(`
      SELECT c.vendor, c.category, c.amount, c.id,
        COALESCE((SELECT SUM(p.amount) FROM vendor_payments p WHERE p.vendor_bill_id = c.id), 0) AS paid
      FROM vendor_bills c JOIN bills b ON b.id = c.bill_id
      WHERE b.status = 'approved' AND b.quote_status = 'won' AND b.superseded_by IS NULL
    `).all().reduce((map, cost) => {
      const entry = map.get(key(cost.vendor)) || { name: cost.vendor, types: new Set(), billed: 0, unpaid: 0, costs: 0 };
      entry.types.add(cost.category);
      entry.billed += cost.amount;
      entry.unpaid += cost.amount - cost.paid;
      entry.costs += 1;
      return map.set(key(cost.vendor), entry);
    }, new Map());
    const topVendors = [...vendors.values()]
      .map(({ name, types, billed, unpaid, costs }) => ({ name, types: [...types], billed: round2(billed), unpaid: round2(unpaid), costs }))
      .sort((a, b) => b.billed - a.billed)
      .slice(0, TOP);

    // Plain-language findings, most urgent first. Each one says where to go next.
    const notices = [];
    const oldest = owed[0];
    if (oldest && oldest.days > 30) {
      notices.push({ tone: 'red', title: `${oldest.customer} owes ${rupees(oldest.balance)} for ${oldest.days} days`, detail: `${oldest.number}. The oldest unpaid project.`, link: `#/project/${oldest.id}` });
    }
    const toCollect = owed.reduce((sum, order) => sum + order.balance, 0);
    if (owed.length) {
      notices.push({ tone: 'amber', title: `${rupees(toCollect)} to collect from ${owed.length} ${owed.length === 1 ? 'project' : 'projects'}`, detail: aging[2].amount > 0 ? `${rupees(aging[2].amount)} of it is over 60 days old.` : 'None of it is over 60 days old.', link: '#/projects' });
    }
    const dueCalls = db.prepare(`
      SELECT COUNT(*) AS n FROM bills WHERE status = 'approved' AND quote_status = 'waiting' AND superseded_by IS NULL
        AND follow_up_on IS NOT NULL AND follow_up_on <= ?
    `).get(today).n;
    if (dueCalls) {
      notices.push({ tone: 'amber', title: `${dueCalls} ${dueCalls === 1 ? 'quotation needs' : 'quotations need'} a follow-up call`, detail: 'Their follow-up date is today or earlier.', link: '#/quotations' });
    }
    const costsDue = topVendors.length ? [...vendors.values()].reduce((sum, vendor) => sum + vendor.unpaid, 0) : 0;
    if (costsDue > 0) {
      notices.push({ tone: 'amber', title: `${rupees(costsDue)} still to pay for project costs`, detail: 'Glass, installation, transport and other costs not paid yet.', link: '#/projects' });
    }
    const since90 = indiaDate(Date.now() - 90 * 86400000);
    const lost = db.prepare(`
      SELECT lost_reason AS reason, COUNT(*) AS n FROM bills
      WHERE status = 'approved' AND quote_status = 'lost' AND superseded_by IS NULL AND substr(approved_at, 1, 10) >= ?
      GROUP BY lost_reason ORDER BY n DESC LIMIT 1
    `).get(since90);
    if (lost && lost.n >= 2) {
      notices.push({ tone: 'neutral', title: `Most lost orders: ${lost.reason} (${lost.n})`, detail: 'Counted over the last 90 days.', link: '#/quotations' });
    }
    // Ranking needs at least two to compare, or the finding says nothing useful.
    if (topCustomers.length >= 2) {
      const best = topCustomers[0];
      notices.push({ tone: 'green', title: `Top customer: ${best.name}`, detail: `${rupees(best.value)} from ${best.orders} ${best.orders === 1 ? 'order' : 'orders'}, before GST.`, link: `#/project/${best.latestId}` });
    }
    if (materials.length >= 2) {
      notices.push({ tone: 'neutral', title: `Best-selling glass: ${materials[0].name}`, detail: `${materials[0].areaSqm} sq m sold for ${rupees(materials[0].value)}.`, link: '#/rates' });
    }

    res.json({
      today,
      notices,
      aging,
      owed: owed.slice(0, TOP).map(({ id, number, customer, phone, balance, days }) => ({ id, number, customer, phone, balance, days })),
      topCustomers,
      materials,
      topVendors,
    });
  });
}

module.exports = { registerInsights, daysBetween };
