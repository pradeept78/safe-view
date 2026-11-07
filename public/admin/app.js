const root = document.getElementById('app');
let me = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => `${value < 0 ? '-' : ''}₹${Math.abs(Number(value || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { draft: 'Draft', pending: 'Waiting for admin', approved: 'Approved' };
const badge = (status) => `<span class="badge ${esc(status)}">${esc(STATUS[status] || status)}</span>`;

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login' && url !== '/api/me') {
    me = null;
    renderLogin();
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const ICONS = {
  bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  enquiries: '<path d="M4 5h16v11H9l-5 4zM8 10h8"/>',
  rates: '<path d="M5 3h14v18H5zM12 3v18M5 12h14"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
};

function shell(active, content) {
  const link = (hash, label) => `<a href="#/${hash}" class="${active === hash ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[hash]}</svg>${label}</a>`;
  root.innerHTML = `
    <div class="layout">
      <aside class="side">
        <img src="/img/word-t.png" alt="Safe View Glass Solutions">
        <nav aria-label="Dashboard">${link('bills', 'Bills')}${link('enquiries', 'Enquiries')}${link('rates', 'Materials & Rates')}${link('settings', 'Settings')}${link('account', 'My Account')}</nav>
        <div class="who">
          <span class="avatar" aria-hidden="true">${esc(me.name.charAt(0).toUpperCase())}</span>
          <div><b>${esc(me.name)}</b><span>${me.role === 'admin' ? 'Admin' : 'Partner'}</span></div>
          <button id="logout" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H10"/></svg></button>
        </div>
      </aside>
      <main class="wrap">${content}</main>
    </div>`;
  document.getElementById('logout').onclick = async () => {
    await api('/api/logout', 'POST');
    me = null;
    renderLogin();
  };
}

function showAlert(id, message, kind = 'bad') {
  const box = document.getElementById(id);
  if (box) box.innerHTML = message ? `<div class="alert ${kind}">${esc(message)}</div>` : '';
}

function renderLogin() {
  root.innerHTML = `
    <div class="login-page">
      <form class="login" id="login">
        <img src="/img/word-t.png" alt="Safe View Glass Solutions">
        <p>Sign in to the dashboard</p>
        <div id="msg"></div>
        <label>Username<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn main">Sign in</button>
      </form>
    </div>`;
  document.getElementById('login').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      me = await api('/api/login', 'POST', Object.fromEntries(form));
      route();
    } catch (error) {
      showAlert('msg', error.message);
    }
  };
}

// ----- Bills list -----
async function billsPage() {
  const [bills, enquiries] = await Promise.all([api('/api/bills'), api('/api/enquiries')]);
  const waiting = bills.filter((b) => b.status === 'pending').length;
  const drafts = bills.filter((b) => b.status === 'draft').length;
  const newEnquiries = enquiries.filter((e) => e.status === 'new').length;
  const month = new Date().toISOString().slice(0, 7);
  const approvedTotal = bills
    .filter((b) => b.status === 'approved' && b.approvedAt.startsWith(month))
    .reduce((total, b) => total + b.totals.grandTotal, 0);
  const rows = bills.map((b) => `
    <tr class="link" data-id="${b.id}">
      <td>${esc(b.number || `Draft ${b.id}`)}</td><td>${esc(b.customerName)}</td><td>${badge(b.status)}</td>
      <td>${esc(b.preparedBy)}</td><td class="n">${money(b.totals.grandTotal)}</td>
    </tr>`).join('');
  shell('bills', `
    <div class="head"><h1>Bills</h1><a class="btn main" href="#/bill/new">+ New Bill</a></div>
    <div class="stats">
      <div class="stat hot"><small>Approved this month</small><b>${money(approvedTotal).replace(/\.\d+$/, '')}</b></div>
      <div class="stat"><small>Waiting for approval</small><b>${waiting}</b></div>
      <div class="stat"><small>Drafts</small><b>${drafts}</b></div>
      <div class="stat"><small>New enquiries</small><b>${newEnquiries}</b></div>
    </div>
    ${me.role === 'admin' && waiting ? `<div class="alert warn">${waiting} bill${waiting > 1 ? 's are' : ' is'} waiting for your approval.</div>` : ''}
    <div class="card scroll">
      ${bills.length ? `<table><tr><th>Bill</th><th>Customer</th><th>Status</th><th>Prepared by</th><th class="n">Total</th></tr>${rows}</table>`
    : '<p class="muted">No bills yet. Choose New Bill to make the first one.</p>'}
    </div>`);
  root.querySelectorAll('tr.link').forEach((row) => { row.onclick = () => { location.hash = `#/bill/${row.dataset.id}`; }; });
}

// ----- Bill editor -----
async function billPage(id) {
  const [settings, glass, bill] = await Promise.all([
    api('/api/settings'),
    api('/api/glass-types'),
    id === 'new' ? null : api(`/api/bills/${id}`),
  ]);
  const editable = !bill || bill.status === 'draft';
  const isAdmin = me.role === 'admin';
  const OTHER = '__other__';
  const isCustom = (line) => Boolean(line.custom) || !glass.some((g) => g.name === line.glassName);
  const state = {
    lines: bill ? bill.lines.map((l) => ({ ...l, gstPercent: l.gstPercent ?? bill.gstPercent, custom: isCustom(l) })) : [],
    extras: bill ? (bill.extras || []).map((e) => ({ ...e })) : [],
    allowanceMm: bill ? bill.allowanceMm : Number(settings.default_allowance_mm),
    gstPercent: bill ? bill.gstPercent : Number(settings.default_gst_percent),
  };
  if (!state.lines.length) state.lines.push(blankLine(glass[0]));
  const off = editable ? '' : 'disabled';
  const v = (key) => esc(bill ? bill[key] : '');
  const missing = ['gstin', 'address', 'bank_account'].filter((key) => !settings[key]);

  shell('bills', `
    <div class="head">
      <h1>${bill ? esc(bill.number || `Draft ${bill.id}`) : 'New Bill'}</h1>
      ${bill ? badge(bill.status) : ''}
    </div>
    <div id="msg"></div>
    ${bill?.returnNote ? `<div class="alert warn">Sent back by admin: ${esc(bill.returnNote)}</div>` : ''}
    ${isAdmin && missing.length && bill?.status !== 'approved' ? '<div class="alert warn">Your GST number, address or bank details are blank in Settings. Add them before approving real bills.</div>' : ''}
    <div class="card">
      <h2>Customer</h2>
      <div class="grid">
        <label>Customer name<input id="customerName" value="${v('customerName')}" ${off}></label>
        <label>Phone<input id="customerPhone" value="${v('customerPhone')}" inputmode="tel" ${off}></label>
        <label class="wide">Address<input id="customerAddress" value="${v('customerAddress')}" ${off}></label>
        <label>GST number<input id="customerGstin" value="${v('customerGstin')}" ${off}></label>
        <label>State code<input id="customerStateCode" value="${v('customerStateCode')}" ${off}></label>
        <label class="wide">Project remark<input id="projectRemark" value="${v('projectRemark')}" ${off}></label>
      </div>
    </div>
    <div class="card">
      <h2>Glass</h2>
      <div class="scroll"><table class="lines" id="lines"></table></div>
      ${editable ? '<p><button class="btn small" id="addLine">Add line</button></p>' : ''}
      <div class="grid" style="max-width:360px">
        <label>Allowance (mm)<input id="allowanceMm" type="number" min="0" value="${state.allowanceMm}" ${off}></label>
      </div>
    </div>
    <div class="card" id="extrasCard">
      <h2>Additional charges</h2>
      <p class="muted" style="margin:-8px 0 12px">For anything priced by hand, like fitting, holes, cut-outs or transport.</p>
      <div class="scroll"><table class="lines" id="extras"></table></div>
      ${editable ? '<p style="margin-bottom:0"><button class="btn small" id="addExtra">Add charge</button></p>' : ''}
    </div>
    <div class="card"><div class="totals" id="totals"></div></div>
    ${bill ? `<p class="muted">Prepared by ${esc(bill.preparedBy)}${bill.checkedBy ? ` · Checked by ${esc(bill.checkedBy)}` : ''}</p>` : ''}
    <div class="acts" id="acts"></div>`);

  function blankLine(type) {
    return {
      shape: 'BLOCK', glassName: type?.name || '', hsn: type?.hsn || '', thicknessMm: type?.thickness_mm || '',
      rate: type?.rate ?? '', listRate: type?.rate ?? null, gstPercent: type?.gst_percent ?? state.gstPercent,
      custom: !type, widthMm: '', heightMm: '', qty: 1,
    };
  }

  // Shows when a rate differs from the material list, so the admin sees it before approving.
  function rateHint(line, index) {
    const hasList = line.listRate !== null && line.listRate !== undefined && line.listRate !== '';
    if (!hasList || Number(line.rate) === Number(line.listRate)) return '';
    const reset = editable ? ` <button type="button" class="link" data-reset="${index}">Reset</button>` : '';
    return `Manual · list ${money(line.listRate)}${reset}`;
  }

  function drawLines() {
    const options = (line) => `${glass.map((g) => `<option ${!line.custom && g.name === line.glassName ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
      <option value="${OTHER}" ${line.custom ? 'selected' : ''}>Other (type manually)</option>`;
    document.getElementById('lines').innerHTML = `
      <tr><th>Material</th><th>Width (mm)</th><th>Height (mm)</th><th>Qty</th><th>Rate / sq m</th><th>GST %</th><th class="n">Area</th><th class="n">Amount</th>${editable ? '<th></th>' : ''}</tr>
      ${state.lines.map((line, i) => `
        <tr data-i="${i}">
          <td><select data-k="pick" aria-label="Material" ${off}>${options(line)}</select></td>
          <td><input data-k="widthMm" type="number" min="1" inputmode="decimal" aria-label="Width" value="${esc(line.widthMm)}" ${off}></td>
          <td><input data-k="heightMm" type="number" min="1" inputmode="decimal" aria-label="Height" value="${esc(line.heightMm)}" ${off}></td>
          <td><input data-k="qty" type="number" min="1" step="1" inputmode="numeric" aria-label="Quantity" value="${esc(line.qty)}" ${off}></td>
          <td><input data-k="rate" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Rate" value="${esc(line.rate)}" ${off}><div class="hint" data-hint>${rateHint(line, i)}</div></td>
          <td><input data-k="gstPercent" type="number" min="0" max="100" step="0.01" inputmode="decimal" aria-label="GST percent" value="${esc(line.gstPercent)}" ${off}></td>
          <td class="n" data-area>–</td><td class="n" data-amount>–</td>
          ${editable ? `<td><button class="btn small danger" data-remove="${i}" aria-label="Remove line">×</button></td>` : ''}
        </tr>
        ${line.custom ? `<tr class="sub" data-i="${i}"><td colspan="${editable ? 9 : 8}"><div class="sub-grid">
          <label>Material name<input data-k="glassName" value="${esc(line.glassName)}" ${off}></label>
          <label>HSN<input data-k="hsn" value="${esc(line.hsn)}" ${off}></label>
          <label>Thickness (mm)<input data-k="thicknessMm" type="number" min="0" step="0.1" value="${esc(line.thicknessMm)}" ${off}></label>
        </div></td></tr>` : ''}`).join('')}`;
  }

  function drawExtras() {
    document.getElementById('extrasCard').hidden = !editable && !state.extras.length;
    document.getElementById('extras').innerHTML = !state.extras.length ? '' : `
      <tr><th>Description</th><th>HSN/SAC</th><th>Amount</th><th>GST %</th>${editable ? '<th></th>' : ''}</tr>
      ${state.extras.map((extra, i) => `
        <tr data-e="${i}">
          <td><input data-x="description" aria-label="Description" style="min-width:200px" value="${esc(extra.description)}" ${off}></td>
          <td><input data-x="hsn" aria-label="HSN or SAC" value="${esc(extra.hsn)}" ${off}></td>
          <td><input data-x="amount" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Amount" value="${esc(extra.amount)}" ${off}></td>
          <td><input data-x="gstPercent" type="number" min="0" max="100" step="0.01" inputmode="decimal" aria-label="GST percent" value="${esc(extra.gstPercent)}" ${off}></td>
          ${editable ? `<td><button class="btn small danger" data-remove-extra="${i}" aria-label="Remove charge">×</button></td>` : ''}
        </tr>`).join('')}`;
  }

  // A row that was added but left empty is ignored rather than treated as a mistake.
  const filledExtras = () => state.extras.filter((extra) => String(extra.description).trim() || extra.amount !== '');

  let timer;
  async function refresh() {
    const box = document.getElementById('totals');
    if (state.lines.some((line) => !line.widthMm || !line.heightMm)) {
      box.innerHTML = '<p class="muted">Enter the sizes to see the total.</p>';
      return;
    }
    try {
      const ready = filledExtras().filter((extra) => String(extra.description).trim() && extra.amount !== '' && extra.gstPercent !== '');
      const result = await api('/api/preview', 'POST', { ...state, extras: ready });
      result.lines.forEach((line, i) => {
        const row = root.querySelector(`tr[data-i="${i}"]`);
        if (!row) return;
        row.querySelector('[data-area]').textContent = line.areaSqm.toFixed(3);
        row.querySelector('[data-amount]').textContent = money(line.amount);
      });
      const t = result.totals;
      box.innerHTML = `
        <div><span>Total area</span><span>${t.areaSqm} sq m (${t.sqft} sq ft)</span></div>
        <div><span>Total weight</span><span>${t.weightKg} kg</span></div>
        ${t.extrasAmount ? `<div><span>Glass amount</span><span>${money(t.glassAmount)}</span></div><div><span>Additional charges</span><span>${money(t.extrasAmount)}</span></div>` : ''}
        <div><span>Basic amount</span><span>${money(t.basic)}</span></div>
        ${t.taxes.map((tax) => `<div><span>CGST ${tax.percent / 2}%</span><span>${money(tax.cgst)}</span></div><div><span>SGST ${tax.percent / 2}%</span><span>${money(tax.sgst)}</span></div>`).join('')}
        <div><span>Round off</span><span>${money(t.roundOff)}</span></div>
        <div class="grand"><span>Grand total</span><span>${money(t.grandTotal)}</span></div>`;
    } catch (error) {
      box.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    }
  }
  const refreshSoon = () => { clearTimeout(timer); timer = setTimeout(refresh, 200); };

  function payload() {
    const value = (key) => document.getElementById(key).value;
    return {
      customerName: value('customerName'), customerPhone: value('customerPhone'), customerAddress: value('customerAddress'),
      customerGstin: value('customerGstin'), customerStateCode: value('customerStateCode'), projectRemark: value('projectRemark'),
      allowanceMm: state.allowanceMm, gstPercent: state.gstPercent, lines: state.lines, extras: filledExtras(),
    };
  }

  // Saves first, so an approval or submission always covers what is on screen.
  async function save() {
    return bill ? api(`/api/bills/${bill.id}`, 'PUT', payload()) : api('/api/bills', 'POST', payload());
  }

  async function act(work) {
    try {
      await work();
    } catch (error) {
      showAlert('msg', error.message);
      window.scrollTo(0, 0);
    }
  }

  const open = (saved) => {
    const target = `#/bill/${saved.id}`;
    if (location.hash === target) route(); else location.hash = target;
  };

  const buttons = [];
  if (editable) {
    buttons.push(['Save Draft', '', () => act(async () => open(await save()))]);
    if (bill && bill.status === 'draft') {
      buttons.unshift(['Delete', 'danger', () => act(async () => {
        if (!confirm('Delete this draft?')) return;
        await api(`/api/bills/${bill.id}`, 'DELETE');
        location.hash = '#/bills';
      })]);
    }
    if (isAdmin) {
      buttons.push(['Approve', 'go', () => act(async () => {
        const saved = await save();
        open(await api(`/api/bills/${saved.id}/approve`, 'POST'));
      })]);
    } else {
      buttons.push(['Send for Approval', 'main', () => act(async () => {
        const saved = await save();
        open(await api(`/api/bills/${saved.id}/submit`, 'POST'));
      })]);
    }
  } else if (bill.status === 'pending' && isAdmin) {
    buttons.push(['Send Back', '', () => act(async () => {
      const note = prompt('What should be changed?');
      if (note === null) return;
      open(await api(`/api/bills/${bill.id}/return`, 'POST', { note }));
    })]);
    buttons.push(['Approve', 'go', () => act(async () => open(await api(`/api/bills/${bill.id}/approve`, 'POST')))]);
  }
  const acts = document.getElementById('acts');
  buttons.forEach(([label, kind, handler]) => {
    const button = document.createElement('button');
    button.className = `btn ${kind}`;
    button.textContent = label;
    button.onclick = handler;
    acts.append(button);
  });
  if (bill?.status === 'approved') {
    acts.insertAdjacentHTML('beforeend', `<a class="btn go" href="/print/${bill.id}" target="_blank" rel="noopener">Print Bill</a>`);
  } else if (bill?.status === 'pending' && !isAdmin) {
    acts.innerHTML = '<p class="muted">Waiting for the admin to approve this bill.</p>';
  }

  if (editable) {
    const table = document.getElementById('lines');
    table.addEventListener('input', (event) => {
      const key = event.target.dataset.k;
      if (!key) return;
      const row = event.target.closest('tr');
      const line = state.lines[row.dataset.i];
      if (key === 'pick') {
        const type = glass.find((g) => g.name === event.target.value);
        Object.assign(line, type
          ? { custom: false, glassName: type.name, hsn: type.hsn, thicknessMm: type.thickness_mm, rate: type.rate, listRate: type.rate, gstPercent: type.gst_percent }
          : { custom: true, glassName: '', hsn: '', thicknessMm: '', rate: '', listRate: null, gstPercent: state.gstPercent });
        drawLines();
      } else {
        line[key] = event.target.value;
        if (key === 'rate') row.querySelector('[data-hint]').innerHTML = rateHint(line, row.dataset.i);
      }
      refreshSoon();
    });
    table.addEventListener('click', (event) => {
      const reset = event.target.dataset.reset;
      if (reset !== undefined) {
        state.lines[reset].rate = state.lines[reset].listRate;
        drawLines();
        refreshSoon();
        return;
      }
      const index = event.target.dataset.remove;
      if (index === undefined || state.lines.length === 1) return;
      state.lines.splice(Number(index), 1);
      drawLines();
      refreshSoon();
    });
    document.getElementById('addLine').onclick = () => {
      const last = state.lines[state.lines.length - 1];
      state.lines.push({ ...last, widthMm: '', heightMm: '', qty: 1 });
      drawLines();
      refreshSoon();
    };
    document.getElementById('allowanceMm').oninput = (event) => { state.allowanceMm = event.target.value; refreshSoon(); };

    const extras = document.getElementById('extras');
    extras.addEventListener('input', (event) => {
      const key = event.target.dataset.x;
      if (!key) return;
      state.extras[event.target.closest('tr').dataset.e][key] = event.target.value;
      refreshSoon();
    });
    extras.addEventListener('click', (event) => {
      const index = event.target.dataset.removeExtra;
      if (index === undefined) return;
      state.extras.splice(Number(index), 1);
      drawExtras();
      refreshSoon();
    });
    document.getElementById('addExtra').onclick = () => {
      state.extras.push({ description: '', hsn: '', amount: '', gstPercent: state.gstPercent });
      drawExtras();
    };
  }
  drawLines();
  drawExtras();
  refresh();
}

// ----- Enquiries -----
async function enquiriesPage() {
  const list = await api('/api/enquiries');
  shell('enquiries', `
    <div class="head"><h1>Website Enquiries</h1></div>
    ${list.length ? list.map((e) => `
      <div class="card enq">
        <div class="head" style="margin:0"><b>${esc(e.name)}</b><span class="badge ${esc(e.status)}">${esc(e.status)}</span></div>
        <div><a href="tel:${esc(e.phone.replace(/[^+\d]/g, ''))}">${esc(e.phone)}</a>${e.service ? ` · ${esc(e.service)}` : ''}</div>
        ${e.message ? `<div>${esc(e.message)}</div>` : ''}
        <div class="muted">${when(e.created_at)}</div>
        <div class="acts">
          <button class="btn small" data-id="${e.id}" data-status="contacted">Mark contacted</button>
          <button class="btn small" data-id="${e.id}" data-status="closed">Close</button>
        </div>
      </div>`).join('') : '<div class="card"><p class="muted">No enquiries yet. They appear here when customers use the website form.</p></div>'}`);
  root.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = async () => {
      await api(`/api/enquiries/${button.dataset.id}`, 'PUT', { status: button.dataset.status });
      enquiriesPage();
    };
  });
}

// ----- Glass rates -----
async function ratesPage() {
  const [glass, settings] = await Promise.all([api('/api/glass-types'), api('/api/settings')]);
  const isAdmin = me.role === 'admin';
  const off = isAdmin ? '' : 'disabled';
  const row = (g) => `
    <tr data-id="${g.id}">
      <td><input data-k="name" aria-label="Material name" style="min-width:220px" value="${esc(g.name)}" ${off}></td>
      <td><input data-k="hsn" aria-label="HSN code" value="${esc(g.hsn)}" ${off}></td>
      <td><input data-k="thickness_mm" aria-label="Thickness" type="number" step="0.1" value="${esc(g.thickness_mm)}" ${off}></td>
      <td><input data-k="rate" aria-label="Rate" type="number" step="0.01" value="${esc(g.rate)}" ${off}></td>
      <td><input data-k="gst_percent" aria-label="GST percent" type="number" step="0.01" value="${esc(g.gst_percent)}" ${off}></td>
      ${isAdmin ? '<td style="white-space:nowrap"><button class="btn small" data-save>Save</button> <button class="btn small danger" data-del>Remove</button></td>' : ''}
    </tr>`;
  shell('rates', `
    <div class="head"><h1>Materials &amp; Rates</h1></div>
    <p class="muted" style="margin:-10px 0 14px">Fill these in once. They appear in the dropdown on every new bill, with the rate and GST filled in.</p>
    <div id="msg"></div>
    <div class="card scroll"><table class="lines">
      <tr><th>Material</th><th>HSN</th><th>Thickness (mm)</th><th>Rate per sq m</th><th>GST %</th>${isAdmin ? '<th></th>' : ''}</tr>
      ${glass.map(row).join('')}
      ${isAdmin ? row({ id: 'new', name: '', hsn: '', thickness_mm: '', rate: '', gst_percent: settings.default_gst_percent }) : ''}
    </table></div>
    ${isAdmin ? '<p class="muted">Use the last row to add a material. Changing a rate or GST does not change bills already made.</p>' : '<p class="muted">Only the admin can change materials and rates.</p>'}`);
  root.querySelectorAll('tr[data-id]').forEach((tr) => {
    const body = () => Object.fromEntries([...tr.querySelectorAll('input')].map((i) => [i.dataset.k, i.value]));
    const isNew = tr.dataset.id === 'new';
    const saveButton = tr.querySelector('[data-save]');
    const removeButton = tr.querySelector('[data-del]');
    if (saveButton) {
      saveButton.onclick = async () => {
        try {
          await api(isNew ? '/api/glass-types' : `/api/glass-types/${tr.dataset.id}`, isNew ? 'POST' : 'PUT', body());
          await ratesPage();
          showAlert('msg', 'Saved', 'good');
        } catch (error) {
          showAlert('msg', error.message);
        }
      };
    }
    if (removeButton) {
      if (isNew) removeButton.remove();
      else removeButton.onclick = async () => { await api(`/api/glass-types/${tr.dataset.id}`, 'DELETE'); ratesPage(); };
    }
  });
}

// ----- Settings -----
const SETTING_FIELDS = [
  ['business_name', 'Business name'], ['tagline', 'Tagline'], ['address', 'Address', 'wide'], ['gstin', 'GST number'],
  ['phone', 'Phone'], ['whatsapp', 'WhatsApp number with country code, like 919876543210'], ['email', 'Email'], ['opening_hours', 'Opening hours'],
  ['bank_name', 'Bank name'], ['bank_account', 'Account number'], ['bank_ifsc', 'IFSC'], ['bank_branch', 'Branch'],
  ['jurisdiction', 'Jurisdiction city'], ['default_allowance_mm', 'Default allowance (mm)'], ['default_gst_percent', 'GST % for manual items'],
  ['next_bill_number', 'Next bill number'],
];

async function settingsPage() {
  const settings = await api('/api/settings');
  const off = me.role === 'admin' ? '' : 'disabled';
  shell('settings', `
    <div class="head"><h1>Settings</h1></div>
    <div id="msg"></div>
    <form class="card" id="form">
      <div class="grid">
        ${SETTING_FIELDS.map(([key, label, wide]) => `<label class="${wide || ''}">${esc(label)}<input name="${key}" value="${esc(settings[key])}" ${off}></label>`).join('')}
        <label class="wide">Terms printed on bills<textarea name="terms" rows="8" ${off}>${esc(settings.terms)}</textarea></label>
      </div>
      ${off ? '<p class="muted">Only the admin can change settings.</p>' : '<p class="acts"><button class="btn main">Save Settings</button></p>'}
    </form>`);
  document.getElementById('form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/settings', 'PUT', Object.fromEntries(new FormData(event.target)));
      showAlert('msg', 'Settings saved', 'good');
    } catch (error) {
      showAlert('msg', error.message);
    }
    window.scrollTo(0, 0);
  };
}

// ----- My account -----
function accountPage() {
  shell('account', `
    <div class="head"><h1>My Account</h1></div>
    <div id="msg"></div>
    <form class="card stack" id="name">
      <h2>Name printed on bills</h2>
      <label>Your name<input name="name" value="${esc(me.name)}" required></label>
      <p class="acts"><button class="btn">Save Name</button></p>
    </form>
    <form class="card stack" id="pass">
      <h2>Change password</h2>
      <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>New password (at least 8 characters)<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="acts"><button class="btn main">Change Password</button></p>
    </form>`);
  document.getElementById('name').onsubmit = async (event) => {
    event.preventDefault();
    try {
      me = await api('/api/me', 'PUT', Object.fromEntries(new FormData(event.target)));
      accountPage();
      showAlert('msg', 'Name saved', 'good');
    } catch (error) {
      showAlert('msg', error.message);
    }
  };
  document.getElementById('pass').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/password', 'POST', Object.fromEntries(new FormData(event.target)));
      event.target.reset();
      showAlert('msg', 'Password changed', 'good');
    } catch (error) {
      showAlert('msg', error.message);
    }
  };
}

async function route() {
  if (!me) return renderLogin();
  const [page, id] = location.hash.replace(/^#\//, '').split('/');
  try {
    if (page === 'bill') await billPage(id);
    else if (page === 'enquiries') await enquiriesPage();
    else if (page === 'rates') await ratesPage();
    else if (page === 'settings') await settingsPage();
    else if (page === 'account') accountPage();
    else await billsPage();
  } catch (error) {
    if (me) shell('', `<div class="alert bad">${esc(error.message)}</div><a class="btn" href="#/bills">Back to bills</a>`);
  }
}

window.addEventListener('hashchange', route);
api('/api/me').then((user) => { me = user; }).catch(() => {}).finally(route);
