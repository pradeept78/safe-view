// One summary of the whole business. Sales and profit use amounts before GST,
// because GST is collected for the government and is not the shop's income.

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
    const orders = db.prepare(`
      SELECT totals_json, order_accepted_on, approved_at FROM bills
      WHERE status = 'approved' AND quote_status = 'won' AND superseded_by IS NULL
    `).all().map((row) => {
      const totals = JSON.parse(row.totals_json);
      return { value: totals.basic || 0, billed: totals.grandTotal || 0, date: row.order_accepted_on || indiaDate(Date.parse(row.approved_at)) };
    });
    const sum = (key) => orders.reduce((amount, order) => amount + order[key], 0);

    const sales = round2(sum('value'));
    const billed = round2(sum('billed'));
    const received = round2(total('SELECT SUM(amount) AS amount FROM payments'));
    const vendorPaid = round2(total('SELECT SUM(amount) AS amount FROM vendor_payments'));
    const expenses = round2(total('SELECT SUM(amount) AS amount FROM expenses'));
    const investment = round2(total('SELECT SUM(amount) AS amount FROM investments'));
    const profit = round2(sales - vendorPaid - expenses);

    const inMonth = (table, month) => db.prepare(`SELECT SUM(amount) AS amount FROM ${table} WHERE date LIKE ?`).get(`${month}-%`).amount || 0;
    const months = lastMonths(12, indiaDate()).map((month) => {
      const monthSales = round2(orders.filter((order) => order.date.startsWith(month)).reduce((amount, order) => amount + order.value, 0));
      const monthVendors = round2(inMonth('vendor_payments', month));
      const monthExpenses = round2(inMonth('expenses', month));
      return { month, sales: monthSales, vendorPaid: monthVendors, expenses: monthExpenses, profit: round2(monthSales - monthVendors - monthExpenses) };
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
      expenses,
      profit,
      investment,
      recoveredPercent: investment > 0 && profit > 0 ? Math.round((profit / investment) * 100) : 0,
      orders: orders.length,
      won: count('won'),
      lost: count('lost'),
      waiting: count('waiting'),
      months,
    });
  });
}

module.exports = { registerOverview, lastMonths };
