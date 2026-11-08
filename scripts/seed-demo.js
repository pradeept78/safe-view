// Builds a separate demo database full of realistic shop activity, so every page has something to show.
// It never touches your real data: it only writes data/demo.db, and it refuses to run in production.
//   npm run demo          make the demo data and open it at http://localhost:4311/admin/
//   node scripts/seed-demo.js   only make the demo data
// Demo sign-ins: admin, partner2 and partner3, all with the DEMO_PASSWORD below.

const fs = require('node:fs');
const path = require('node:path');
const { openDatabase, hashPassword } = require('../src/db');
const { createApp } = require('../src/app');

const DEMO_PASSWORD = 'demo-safeview-1';
const DEMO_FILE = process.env.DEMO_DB || path.join(__dirname, '..', 'data', 'demo.db');
const DAY = 86400000;
const indiaToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const daysAgo = (days) => new Date(Date.now() + 5.5 * 3600000 - days * DAY).toISOString().slice(0, 10);

// A fixed starting number gives the same demo every time it is built.
let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (low, high) => Math.round(low + random() * (high - low));

const MATERIALS = [
  ['5MM CLEAR TOUGHENED GLASS', '70071900', 5, 684.15],
  ['8MM CLEAR TOUGHENED GLASS', '70071900', 8, 960],
  ['10MM CLEAR TOUGHENED GLASS', '70071900', 10, 1285.5],
  ['12MM CLEAR TOUGHENED GLASS', '70071900', 12, 1620],
  ['6MM FROSTED GLASS', '70052990', 6, 820],
  ['5MM MIRROR', '70091000', 5, 540],
  ['24MM DGU (6+12+6)', '70080000', 24, 2950],
];
const CUSTOMERS = [
  ['Ravi Kumar', 'Indiranagar, Bengaluru'], ['Meena Interiors', 'Koramangala, Bengaluru'], ['Sri Lakshmi Glass Works', 'Peenya Industrial Area'],
  ['Prestige Apartments', 'Whitefield, Bengaluru'], ['Anil Reddy', 'HSR Layout, Bengaluru'], ['Kavya Homes', 'Sarjapur Road'],
  ['Rahul Shah', 'JP Nagar, Bengaluru'], ['Noor Traders', 'Shivajinagar, Bengaluru'], ['Green Leaf Cafe', 'MG Road, Bengaluru'],
  ['Dr. Priya Clinic', 'Jayanagar, Bengaluru'], ['Sunrise Builders', 'Hebbal, Bengaluru'], ['Arjun Menon', 'Malleshwaram, Bengaluru'],
];
const REMARKS = ['Balcony railing', 'Shower enclosure', 'Office partition', 'Kitchen shutters', 'Window glazing', 'Mirror wall', 'Shop front'];
const SIZES = [[1200, 970], [900, 2000], [1500, 1200], [600, 1800], [2400, 1200], [1338, 893]];
const VENDORS = { Glass: ['Saint Glass Processing', 'Asahi Toughening Unit'], Installation: ['Suresh Fitters', 'Ramesh & Team'], Transport: ['City Tempo Service'], Hardware: ['Dorma Hardware Store'] };

async function buildDemo(file = DEMO_FILE) {
  if (process.env.NODE_ENV === 'production') throw new Error('The demo is for your own computer only, not the live server.');
  if (!/demo[^/\\]*\.db$/.test(file)) throw new Error('The demo file name must contain "demo" and end in .db, to protect real data.');
  for (const end of ['', '-wal', '-shm']) fs.rmSync(file + end, { force: true });

  const db = openDatabase(file);
  const { hash, salt } = hashPassword(DEMO_PASSWORD);
  db.prepare('UPDATE users SET pass_hash = ?, salt = ?').run(hash, salt);
  db.prepare("UPDATE users SET name = 'Kiran' WHERE username = 'admin'").run();
  db.prepare("UPDATE users SET name = 'Venky' WHERE username = 'partner2'").run();
  db.prepare("UPDATE users SET name = 'Pradeep' WHERE username = 'partner3'").run();

  const server = await new Promise((resolve) => { const s = createApp(db, { limits: { login: 1000, enquiry: 1000 }, notify: async () => {} }).listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (username) => {
    const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: DEMO_PASSWORD }) });
    return res.headers.get('set-cookie').split(';')[0];
  };
  const admin = await login('admin');
  const partner = await login('partner2');
  const call = async (method, url, body, cookie = admin) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url}: ${data.error || res.status}`);
    return data;
  };
  // Real dates spread over the year, so the graphs and reports have history.
  const backdate = (id, day) => db.prepare('UPDATE bills SET approved_at = ?, created_at = ?, updated_at = ? WHERE id = ?')
    .run(`${day}T10:30:00.000Z`, `${day}T09:00:00.000Z`, `${day}T10:30:00.000Z`, id);

  try {
    await call('PUT', '/api/settings', {
      address: 'No 12, Old Airport Road, Near Vijaya College, Bengaluru 560017', gstin: '29ABCDE1234F1Z5', phone: '+91 98450 12345',
      whatsapp: '919845012345', email: 'hello@safeview.example', opening_hours: 'Mon to Sat, 9:30am to 7:30pm', bank_name: 'HDFC Bank',
      bank_account: '50100123456789', bank_ifsc: 'HDFC0001234', bank_branch: 'Indiranagar', jurisdiction: 'Bengaluru',
    });
    const existing = await call('GET', '/api/glass-types');
    for (const [name, hsn, thickness, rate] of MATERIALS) {
      const found = existing.find((g) => g.name === name);
      const body = { name, hsn, thickness_mm: thickness, rate, gst_percent: 18 };
      if (found) await call('PUT', `/api/glass-types/${found.id}`, body);
      else await call('POST', '/api/glass-types', body);
    }

    const makeBill = async (customer, by = partner) => {
      const lines = Array.from({ length: between(2, 4) }, () => {
        const [name, hsn, thickness, rate] = pick(MATERIALS);
        const [width, height] = pick(SIZES);
        return { glassName: name, hsn, thicknessMm: thickness, rate, listRate: rate, gstPercent: 18, qty: between(2, 8), widthMm: width, heightMm: height };
      });
      const extras = random() < 0.4 ? [{ description: 'Fitting and transport', hsn: '9954', amount: between(8, 30) * 100, gstPercent: 18 }] : [];
      return call('POST', '/api/bills', {
        customerName: customer[0], customerPhone: `+91 9${between(100000000, 999999999)}`, customerAddress: customer[1], customerStateCode: '29',
        projectRemark: pick(REMARKS), lines, extras,
      }, by);
    };
    const approve = async (bill, day) => {
      await call('POST', `/api/bills/${bill.id}/submit`, {}, partner);
      await call('POST', `/api/bills/${bill.id}/approve`);
      backdate(bill.id, day);
    };

    // Won orders across the last twelve months, each with money in and costs out.
    let finished = 0;
    for (let i = 0; i < 40; i += 1) {
      const customer = CUSTOMERS[i % CUSTOMERS.length];
      const accepted = daysAgo(between(4, 345));
      const age = Math.round((Date.parse(indiaToday()) - Date.parse(accepted)) / DAY);
      const bill = await makeBill(customer);
      await approve(bill, daysAgo(age + between(2, 9)));
      await call('PUT', `/api/quotations/${bill.id}/won`, { acceptedOn: accepted });
      const project = await call('GET', `/api/projects/${bill.id}`);
      const after = (days) => daysAgo(Math.max(0, age - days));

      // Glass is always bought; installation, transport and hardware often.
      const glassCost = Math.round(project.orderValue * (0.38 + random() * 0.12));
      await call('POST', `/api/projects/${bill.id}/vendor-bills`, {
        date: after(3), category: 'Glass', vendor: pick(VENDORS.Glass), description: 'Toughening and cutting', amount: glassCost,
        paidNow: age > 40 ? glassCost : Math.round(glassCost / 2), method: 'online',
      });
      if (random() < 0.8) {
        const fitting = between(6, 25) * 100;
        await call('POST', `/api/projects/${bill.id}/vendor-bills`, { date: after(8), category: 'Installation', vendor: pick(VENDORS.Installation), description: 'Fitting', amount: fitting, paidNow: age > 20 ? fitting : 0, method: 'cash' });
      }
      if (random() < 0.6) {
        const trip = between(3, 9) * 100;
        await call('POST', `/api/projects/${bill.id}/vendor-bills`, { date: after(7), category: 'Transport', vendor: VENDORS.Transport[0], description: 'Delivery', amount: trip, paidNow: trip, method: 'cash' });
      }
      if (random() < 0.3) {
        await call('POST', `/api/projects/${bill.id}/vendor-bills`, { date: after(6), category: 'Hardware', vendor: VENDORS.Hardware[0], description: 'Patch fittings and handles', amount: between(10, 40) * 100, paidNow: 0, method: 'cash' });
        if (age > 30) {
          const unpaid = (await call('GET', `/api/projects/${bill.id}`)).vendorBills.filter((cost) => cost.due > 0);
          for (const cost of unpaid) await call('POST', `/api/projects/${bill.id}/vendor-payments`, { date: after(10), vendorBillId: cost.id, amount: cost.due, method: 'online' });
        }
      }

      // Customers pay an advance, then the rest. Older jobs are mostly settled; a few run late.
      const advance = Math.round(project.grandTotal * 0.5);
      await call('POST', `/api/projects/${bill.id}/payments`, { date: after(1), amount: advance, method: random() < 0.6 ? 'online' : 'cash', reference: 'Advance' });
      const late = i % 7 === 3 && age < 120;
      if (age > 25 && !late) {
        const rest = (await call('GET', `/api/projects/${bill.id}`)).balance;
        await call('POST', `/api/projects/${bill.id}/payments`, { date: after(20), amount: rest, method: random() < 0.6 ? 'online' : 'cash', reference: 'Final payment' });
      }
      if (age > 18) {
        await call('PUT', `/api/projects/${bill.id}/status`, { status: 'completed', completedOn: after(15) });
        finished += 1;
        if (finished <= 3) await call('POST', `/api/bills/${bill.id}/tax-invoice`, { date: after(15), stateCode: '29' });
      }
    }

    // Quotations still waiting, some due for a call today.
    for (let i = 0; i < 5; i += 1) {
      const bill = await makeBill(pick(CUSTOMERS));
      await approve(bill, daysAgo(between(1, 20)));
      if (i < 3) await call('PUT', `/api/quotations/${bill.id}/follow-up`, { followUpOn: daysAgo(i - 1) });
    }
    // Lost quotations, with real reasons.
    for (const [reason, note] of [['Price too high', 'Competitor quoted ₹620 per sq m'], ['Price too high', 'Wanted a 10% discount'], ['Delivery time too long', 'Needed it within 2 days'], ['Chose another vendor', ''], ['Price too high', ''], ['Project postponed', 'Building work delayed']]) {
      const bill = await makeBill(pick(CUSTOMERS));
      await approve(bill, daysAgo(between(5, 80)));
      await call('PUT', `/api/quotations/${bill.id}/lost`, { reason, note });
    }
    // A revision, drafts and one waiting for the admin.
    const revised = (await call('GET', '/api/projects')).find((p) => p.status !== 'completed');
    if (revised) await call('POST', `/api/bills/${revised.id}/revise`);
    await makeBill(['Lake View Villas', 'Yelahanka, Bengaluru']);
    await makeBill(['Café Brew Point', 'Indiranagar, Bengaluru'], admin);
    const pending = await makeBill(['Hotel Sapphire', 'Residency Road, Bengaluru']);
    await call('POST', `/api/bills/${pending.id}/submit`, {}, partner);

    // Shop running costs for every month, and the money the partners put in.
    for (let month = 11; month >= 0; month -= 1) {
      const day = (date) => {
        const d = new Date(Date.now() + 5.5 * 3600000);
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - month);
        d.setUTCDate(date);
        return d.toISOString().slice(0, 10);
      };
      if (day(5) > indiaToday()) continue;
      await call('POST', '/api/expenses', { date: day(5), category: 'Rent', description: 'Shop rent', amount: 15000, method: 'online' });
      await call('POST', '/api/expenses', { date: day(5), category: 'Salaries', description: 'Helper salary', amount: 12000, method: 'online' });
      await call('POST', '/api/expenses', { date: day(5), category: 'Electricity', amount: between(15, 30) * 100, method: 'online' });
      if (month % 2 === 0) await call('POST', '/api/expenses', { date: day(5), category: 'Transport', description: 'Van fuel', amount: between(8, 18) * 100, method: 'cash' });
    }
    for (const [days, person, paidFor, amount, method] of [[350, 'Kiran', 'Glass cutting machine and workbench', 350000, 'online'], [340, 'Venky', 'Shop deposit', 200000, 'cash'], [300, 'Pradeep', 'Showroom display panels', 120000, 'online']]) {
      await call('POST', '/api/investments', { date: daysAgo(days), person, paidFor, amount, method });
    }
    for (const [name, service, message] of [['Website Visitor', 'Shower Enclosures', 'Need a frameless shower door, about 900 by 2000 mm.'], ['Sneha', 'Balcony Glass', 'Balcony of 12 feet, please call after 6pm.'], ['Office Admin', 'Glass Partitions', 'Office cabins for 4 rooms.']]) {
      await fetch(`${base}/api/enquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone: `+91 9${between(100000000, 999999999)}`, service, message }) });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
  return file;
}

if (require.main === module) {
  buildDemo().then((file) => {
    console.log(`Demo data ready: ${file}`);
    console.log('Sign in as admin, partner2 or partner3. The password is DEMO_PASSWORD in scripts/seed-demo.js.');
  }).catch((error) => {
    console.error(`Demo data failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { buildDemo, DEMO_PASSWORD };
