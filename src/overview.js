// One summary of the whole business. Sales and profit use amounts before GST,
// because GST is collected for the government and is not the shop's income.
// Profit is only confirmed once a project is finished, because vendor costs can still arrive.

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const indiaDate = (time = Date.now()) => new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);

function lastMonths(count, today) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

function registerOverview(app, { db, requireLogin }) {
  app.get('/api/overview', requireLogin, (req, res) => {
    const total = (sql) => db.prepare(sql).get().amount || 0;
    const costOf = (id, table) => db.prepare(`SELECT SUM(amount) AS amount FROM ${table} WHERE bill_id = ?`).get(id).amount || 0;

    const orders = db.prepare(`
      SELECT id, totals_json, order_accepted_on, approved_at, project_status, completed_on FROM bills
      WHERE status = 'approved' AND quote_status = 'won' AND superseded_by IS NULL
    `).all().map((row) => {
      const totals = JSON.parse(row.totals_json);
      const billedByVendors = costOf(row.id, 'vendor_bills');
      const paidToVendors = costOf(row.id, 'vendor_payments');
      const value = totals.basic || 0;
      const cost = Math.max(billedByVendors, paidToVendors);
      return {
        value,
        billed: totals.grandTotal || 0,
        date: row.order_accepted_on || indiaDate(Date.parse(row.approved_at)),
        completed: row.project_status === 'completed',
        completedOn: row.completed_on,
        cost,
        profit: value - cost,
        vendorDue: Math.max(billedByVendors - paidToVendors, 0),
      };
    });
    const sum = (list, key) => round2(list.reduce((amount, order) => amount + order[key], 0));
    const finished = orders.filter((order) => order.completed);
    const running = orders.filter((order) => !order.completed);

    const sales = sum(orders, 'value');
    const billed = sum(orders, 'billed');
    const received = round2(total('SELECT SUM(amount) AS amount FROM payments'));
    const vendorPaid = round2(total('SELECT SUM(amount) AS amount FROM vendor_payments'));
    const expenses = round2(total('SELECT SUM(amount) AS amount FROM expenses'));
    const investment = round2(total('SELECT SUM(amount) AS amount FROM investments'));
    const confirmedProfit = sum(finished, 'profit');
    const afterExpenses = round2(confirmedProfit - expenses);

    const months = lastMonths(12, indiaDate()).map((month) => {
      const monthSales = sum(orders.filter((order) => order.date.startsWith(month)), 'value');
      const monthProfit = sum(finished.filter((order) => (order.completedOn || '').startsWith(month)), 'profit');
      const monthExpenses = round2(db.prepare('SELECT SUM(amount) AS amount FROM expenses WHERE date LIKE ?').get(`${month}-%`).amount || 0);
      return { month, sales: monthSales, confirmedProfit: monthProfit, expenses: monthExpenses, net: round2(monthProfit - monthExpenses) };
    });

    const quotes = db.prepare(`
      SELECT quote_status AS status, COUNT(*) AS n FROM bills
      WHERE status = 'approved' AND superseded_by IS NULL GROUP BY quote_status
    `).all();
    const count = (status) => quotes.find((quote) => quote.status === status)?.n || 0;

    res.json({
      sales,
      billed,
      received,
      toCollect: round2(billed - received),
      vendorPaid,
      vendorCost: sum(orders, 'cost'),
      vendorDue: sum(orders, 'vendorDue'),
      expenses,
      confirmedProfit,
      expectedProfit: sum(running, 'profit'),
      afterExpenses,
      investment,
      recoveredPercent: investment > 0 && afterExpenses > 0 ? Math.round((afterExpenses / investment) * 100) : 0,
      orders: orders.length,
      completed: finished.length,
      inProgress: running.length,
      won: count('won'),
      lost: count('lost'),
      waiting: count('waiting'),
      months,
    });
  });
}

module.exports = { registerOverview, lastMonths };
