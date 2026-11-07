const root = document.getElementById('app');
let me = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => `${value < 0 ? '-' : ''}₹${Math.abs(Number(value || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { draft: 'Draft', pending: 'Waiting for admin', approved: 'Approved' };
const badge = (status) => `<span class="badge ${esc(status)}">${esc(STATUS[status] || status)}</span>`;
const QUOTE_STATUS = { waiting: 'Waiting for customer', won: 'Won', lost: 'Lost' };
const quoteBadge = (status) => `<span class="badge q-${esc(status)}">${esc(QUOTE_STATUS[status] || status)}</span>`;
const billBadge = (bill) => {
  if (bill.supersededBy) return '<span class="badge q-revised">Revised</span>';
  return bill.status === 'approved' ? quoteBadge(bill.quoteStatus) : badge(bill.status);
};

async function api(url, method = 'GET', body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach Safe View. Check your internet and try again. What you typed is still here.');
  }
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
  quotations: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13l2 2 4-4"/>',
  projects: '<path d="M3 7h7l2 3h9v10H3zM3 7V4h6l2 3"/>',
  accounts: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  investment: '<path d="M12 3v18M17 7c-1-2-3-3-5-3-3 0-5 1.500-5 4s2 3.500 5 4 5 1.500 5 4-2 4-5 4c-2 0-4-1-5-3"/>',
  rates: '<path d="M5 3h14v18H5zM12 3v18M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c.7-4 3.200-6 6.500-6s5.800 2 6.500 6M16 5a3.500 3.500 0 0 1 0 6.500M18 14c2 .8 3.200 2.800 3.500 6"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
};

function shell(active, content) {
  const link = (hash, label) => `<a href="#/${hash}" class="${active === hash ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[hash]}</svg>${label}</a>`;
  const tab = (hash, label) => `<a href="#/${hash}" class="${active === hash ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[hash]}</svg>${label}</a>`;
  const more = [['investment', 'Investment'], ['enquiries', 'Enquiries'], ['rates', 'Materials & Rates'], ...(me.role === 'admin' ? [['users', 'Users']] : []), ['settings', 'Settings'], ['account', 'My Account']];
  const moreActive = more.some(([hash]) => hash === active);
  root.innerHTML = `
    <div class="layout">
      <aside class="side">
        <img src="/img/word-t.png" alt="Safe View Glass Solutions">
        <nav aria-label="Dashboard">${link('bills', 'Bills')}${link('quotations', 'Quotations')}${link('projects', 'Projects')}${link('accounts', 'Monthly Accounts')}${link('investment', 'Investment')}${link('enquiries', 'Enquiries')}${link('rates', 'Materials & Rates')}${me.role === 'admin' ? link('users', 'Users') : ''}${link('settings', 'Settings')}${link('account', 'My Account')}</nav>
        <div class="who">
          <span class="avatar" aria-hidden="true">${esc(me.name.charAt(0).toUpperCase())}</span>
          <div><b>${esc(me.name)}</b><span>${me.role === 'admin' ? 'Admin' : 'Partner'}</span></div>
          <button id="logout" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H10"/></svg></button>
        </div>
      </aside>
      <main class="wrap">${content}</main>
      <nav class="tabbar" aria-label="Main">
        ${tab('bills', 'Bills')}${tab('quotations', 'Quotes')}${tab('projects', 'Projects')}${tab('accounts', 'Accounts')}
        <button type="button" class="${moreActive ? 'on' : ''}" id="moreBtn" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.500"/><circle cx="12" cy="12" r="1.500"/><circle cx="19" cy="12" r="1.500"/></svg>More</button>
      </nav>
      <div class="sheet" id="moreSheet" hidden>
        <div class="sheet-panel">
          <p class="sheet-who">${esc(me.name)} · ${me.role === 'admin' ? 'Admin' : 'Partner'}</p>
          ${more.map(([hash, label]) => link(hash, label)).join('')}
          ${canOfferInstall() ? '<button type="button" class="sheet-install" id="sheetInstall">Install App</button>' : ''}
          <button type="button" id="sheetLogout">Sign out</button>
        </div>
      </div>
    </div>`;
  const sheet = document.getElementById('moreSheet');
  const moreBtn = document.getElementById('moreBtn');
  const toggleSheet = (open) => { sheet.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); };
  moreBtn.onclick = () => toggleSheet(sheet.hidden);
  sheet.onclick = (event) => { if (event.target === sheet || event.target.closest('a')) toggleSheet(false); };
  const signOut = async () => {
    await api('/api/logout', 'POST');
    me = null;
    renderLogin();
  };
  document.getElementById('logout').onclick = signOut;
  document.getElementById('sheetLogout').onclick = signOut;
  const installButton = document.getElementById('sheetInstall');
  if (installButton) {
    installButton.onclick = () => {
      toggleSheet(false);
      installApp();
    };
  }
}

function showToast(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = '<span class="toast-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg></span><span></span>';
  toast.lastElementChild.textContent = message;
  document.body.append(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  }, 2600);
}

const DIALOG_ICONS = {
  danger: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  warn: '<path d="M12 4 2.500 20h19zM12 10v4M12 17h.01"/>',
  info: '<path d="M4 12a8 8 0 1 1 2.500 5.800L4 20l.8-3.200A8 8 0 0 1 4 12zM9 10h6M9 14h4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l3 3"/>',
};

// One designed pop-up for every question. It resolves to the typed text, true, or null if cancelled.
function openDialog({ tone = 'warn', title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', field }) {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogText" novalidate>
        <span class="dialog-icon ${esc(tone)}" aria-hidden="true"><svg viewBox="0 0 24 24">${DIALOG_ICONS[tone]}</svg></span>
        <h2 id="dialogTitle">${esc(title)}</h2>
        <p id="dialogText">${esc(message)}</p>
        ${field ? `<label>${esc(field.label)}${field.multiline
    ? `<textarea name="value" rows="3" maxlength="${field.maxLength || 500}" placeholder="${esc(field.placeholder || '')}"></textarea>`
    : `<input name="value" type="text" autocomplete="off" autocapitalize="none" maxlength="${field.maxLength || 200}" placeholder="${esc(field.placeholder || '')}">`}</label>
          <p class="dialog-error" id="dialogError" role="alert"></p>` : ''}
        <div class="dialog-actions">
          <button type="button" class="btn" data-cancel>${esc(cancelLabel)}</button>
          <button class="btn ${tone === 'danger' ? 'destroy' : 'main'}">${esc(confirmLabel)}</button>
        </div>
      </form>`;
    const form = overlay.querySelector('form');
    const input = form.elements.value;

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 160);
      returnFocus?.focus?.();
      resolve(result);
    };
    function onKey(event) {
      if (event.key === 'Escape') return close(null);
      if (event.key !== 'Tab') return;
      const items = [...form.querySelectorAll('input, textarea, button')];
      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    }

    form.onsubmit = (event) => {
      event.preventDefault();
      if (!field) return close(true);
      const problem = field.validate?.(input.value);
      if (problem) {
        form.querySelector('#dialogError').textContent = problem;
        input.focus();
        return;
      }
      close(input.value);
    };
    form.querySelector('[data-cancel]').onclick = () => close(null);
    overlay.onclick = (event) => { if (event.target === overlay) close(null); };
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    (input || form.querySelector('button:not([data-cancel])')).focus();
  });
}

function showAlert(id, message, kind = 'bad') {
  if (message && kind === 'good') return showToast(message);
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
        <p class="login-help">Forgot your password? Ask your admin to reset it on the Users page.</p>
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
const billList = { q: '', status: 'all', items: [], total: 0 };
const BILL_FILTER_LABELS = [['all', 'All bills'], ['draft', 'Drafts'], ['pending', 'Waiting for admin'], ['waiting', 'Waiting for customer'], ['won', 'Won'], ['lost', 'Lost'], ['revised', 'Revised (old versions)']];

function drawBillResults() {
  const box = document.getElementById('billResults');
  if (!box) return;
  const rows = billList.items.map((b) => `
    <tr class="link" data-id="${b.id}">
      <td>${esc(b.number || `Draft ${b.id}`)}</td><td>${esc(b.customerName)}</td><td>${billBadge(b)}</td>
      <td>${esc(b.preparedBy)}</td><td class="n">${money(b.totals.grandTotal)}</td>
    </tr>`).join('');
  const searching = billList.q || billList.status !== 'all';
  box.innerHTML = billList.items.length ? `
    <table class="compact"><tr><th>Bill</th><th>Customer</th><th>Status</th><th>Prepared by</th><th class="n">Total</th></tr>${rows}</table>
    <p class="muted list-count">Showing ${billList.items.length} of ${billList.total}</p>
    ${billList.items.length < billList.total ? '<button class="btn load-more" id="loadMore">Load More</button>' : ''}`
    : `<p class="muted">${searching ? 'No bills match this search.' : 'No bills yet. Choose New Bill to make the first one.'}</p>`;
  box.querySelectorAll('tr.link').forEach((row) => { row.onclick = () => { location.hash = `#/bill/${row.dataset.id}`; }; });
  const more = document.getElementById('loadMore');
  if (more) more.onclick = () => loadBills(true);
}

async function fetchBills(offset) {
  const query = new URLSearchParams({ q: billList.q, status: billList.status, offset: String(offset) });
  return api(`/api/bills?${query}`);
}

async function loadBills(append = false) {
  const result = await fetchBills(append ? billList.items.length : 0);
  billList.items = append ? [...billList.items, ...result.bills] : result.bills;
  billList.total = result.total;
  drawBillResults();
}

async function billsPage() {
  const [result, enquiries] = await Promise.all([fetchBills(0), api('/api/enquiries')]);
  billList.items = result.bills;
  billList.total = result.total;
  const { stats } = result;
  const newEnquiries = enquiries.filter((e) => e.status === 'new').length;
  shell('bills', `
    <div class="head"><h1>Bills</h1><a class="btn main" href="#/bill/new">+ New Bill</a></div>
    <div class="stats">
      <div class="stat hot"><small>Approved this month</small><b>${money(stats.approvedThisMonth).replace(/\.\d+$/, '')}</b></div>
      <div class="stat"><small>Waiting for approval</small><b>${stats.waiting}</b></div>
      <div class="stat"><small>Drafts</small><b>${stats.drafts}</b></div>
      <div class="stat"><small>New enquiries</small><b>${newEnquiries}</b></div>
    </div>
    ${me.role === 'admin' && stats.waiting ? `<div class="alert warn">${stats.waiting} bill${stats.waiting > 1 ? 's are' : ' is'} waiting for your approval.</div>` : ''}
    <div class="finder">
      <label>Search<input id="billSearch" type="search" placeholder="Customer, phone, bill or invoice number" value="${esc(billList.q)}"></label>
      <label>Show<select id="billStatus">${BILL_FILTER_LABELS.map(([value, label]) => `<option value="${value}" ${billList.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>
    <div class="card scroll" id="billResults"></div>`);
  drawBillResults();
  let timer;
  document.getElementById('billSearch').oninput = (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => { billList.q = event.target.value.trim(); loadBills(); }, 250);
  };
  document.getElementById('billStatus').onchange = (event) => { billList.status = event.target.value; loadBills(); };
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
      ${bill ? billBadge(bill) : ''}
    </div>
    <div id="msg"></div>
    ${bill?.returnNote ? `<div class="alert warn">Sent back by admin: ${esc(bill.returnNote)}</div>` : ''}
    ${bill?.supersededBy ? `<div class="alert bad">This old version was replaced by <a href="#/bill/${bill.supersededBy}">${esc(bill.supersededByNumber)}</a>. It no longer counts.</div>` : ''}
    ${bill?.revisesId ? `<div class="alert warn">${bill.status === 'approved' ? 'Replaces' : 'Revising'} <a href="#/bill/${bill.revisesId}">${esc(bill.revisesNumber)}</a>.${bill.status === 'approved' ? '' : ' The old bill stays valid until this one is approved.'}</div>` : ''}
    ${bill?.openRevisionId ? `<div class="alert warn">A revision is in progress. <a href="#/bill/${bill.openRevisionId}">Open the revision</a>.</div>` : ''}
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
    <div id="decision"></div>
    ${bill?.history?.length > 1 ? `<div class="card"><h2>Version history (${bill.history.length})</h2><div class="versions">${bill.history.map((v, index) => `<a href="#/bill/${v.id}" class="${v.id === bill.id ? 'on' : ''}">Version ${index + 1}: ${esc(v.number)}</a>`).join('')}</div></div>` : ''}
    ${bill ? `<p class="muted">Prepared by ${esc(bill.preparedBy)}${bill.checkedBy ? ` · Checked by ${esc(bill.checkedBy)}` : ''}</p>` : ''}
    <div class="savebar"><div class="savetotal" id="saveTotal"></div><div class="acts" id="acts"></div></div>`);

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
      document.getElementById('saveTotal').textContent = '';
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
      document.getElementById('saveTotal').textContent = `Total ${money(t.grandTotal)}`;
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
        const sure = await openDialog({
          tone: 'danger', title: 'Delete this draft?', message: 'This bill will be removed for everyone. This cannot be undone.', confirmLabel: 'Delete Draft', cancelLabel: 'Keep Draft',
        });
        if (!sure) return;
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
      const note = await openDialog({
        tone: 'info',
        title: 'Send back for changes?',
        message: 'The bill goes back to draft so a partner can fix it.',
        confirmLabel: 'Send Back',
        field: { label: 'What should be changed?', multiline: true, placeholder: 'Like: please check the width on line 2', validate: (value) => (value.trim() ? '' : 'Tell your partner what to change') },
      });
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
    acts.insertAdjacentHTML('beforeend', `${bill.quoteStatus === 'won' && !bill.supersededBy ? `<a class="btn" href="#/project/${bill.id}">Payments</a>` : ''}<a class="btn go" href="/print/${bill.id}" target="_blank" rel="noopener">Print Bill</a>`);
    if (!bill.supersededBy && !bill.invoiceNumber && !bill.openRevisionId && bill.quoteStatus !== 'lost') {
      const reviseButton = document.createElement('button');
      reviseButton.className = 'btn';
      reviseButton.textContent = 'Revise Bill';
      reviseButton.onclick = () => act(async () => {
        const sure = await openDialog({
          title: 'Revise this bill?',
          message: 'This makes an editable copy. The current bill stays valid until the copy is approved, then payments and order details move across.',
          confirmLabel: 'Revise Bill',
        });
        if (!sure) return;
        const copy = await api(`/api/bills/${bill.id}/revise`, 'POST');
        location.hash = `#/bill/${copy.id}`;
      });
      acts.prepend(reviseButton);
    }
    await drawDecision(bill);
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

// ----- Users -----
async function usersPage() {
  const users = await api('/api/users');
  const row = (u) => `
    <tr data-id="${u.id}">
      <td><input data-k="name" aria-label="Name" style="min-width:170px" value="${esc(u.name)}" maxlength="80"></td>
      <td>${esc(u.username)}${u.id === me.id ? ' <span class="muted">(you)</span>' : ''}</td>
      <td><select data-k="role" aria-label="Role" style="min-width:110px"><option value="partner" ${u.role === 'partner' ? 'selected' : ''}>Partner</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
      <td><label class="check"><input type="checkbox" data-k="active" ${u.active ? 'checked' : ''}> Can sign in</label></td>
      <td style="white-space:nowrap"><button class="btn small" data-save>Save</button> <button class="btn small" data-password>Reset Password</button></td>
    </tr>`;
  shell('users', `
    <div class="head"><h1>Users</h1></div>
    <div id="msg"></div>
    <div class="card scroll">
      <table class="lines"><tr><th>Name</th><th>Username</th><th>Role</th><th>Access</th><th></th></tr>${users.map(row).join('')}</table>
      <p class="muted" style="margin-bottom:0">Admins can approve bills and manage users. Partners can make bills and add entries. To remove someone, untick Can sign in, because their name stays on past bills.</p>
    </div>
    <form class="card" id="add">
      <h2>Add a user</h2>
      <div class="entry" style="margin:0;padding:0;border:0">
        <label>Name<input name="name" maxlength="80" required></label>
        <label>Username<input name="username" autocapitalize="none" autocomplete="off" maxlength="40" required></label>
        <label>Role<select name="role"><option value="partner">Partner</option><option value="admin">Admin</option></select></label>
        <label>First password (at least 8 characters)<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn main">Add User</button>
      </div>
    </form>`);
  document.getElementById('add').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/users', 'POST', Object.fromEntries(new FormData(event.target)));
      await usersPage();
      showAlert('msg', 'User added. Ask them to change their password under My Account.', 'good');
    } catch (error) {
      showAlert('msg', error.message);
    }
    window.scrollTo(0, 0);
  };
  root.querySelectorAll('tr[data-id]').forEach((tr) => {
    const { id } = tr.dataset;
    tr.querySelector('[data-save]').onclick = async () => {
      try {
        const saved = await api(`/api/users/${id}`, 'PUT', {
          name: tr.querySelector('[data-k=name]').value,
          role: tr.querySelector('[data-k=role]').value,
          active: tr.querySelector('[data-k=active]').checked,
        });
        if (saved.id === me.id) me = { ...me, name: saved.name, role: saved.role };
        if (me.role !== 'admin') return route();
        await usersPage();
        showAlert('msg', 'Saved', 'good');
      } catch (error) {
        showAlert('msg', error.message);
      }
      window.scrollTo(0, 0);
    };
    tr.querySelector('[data-password]').onclick = async () => {
      const person = tr.querySelector('[data-k=name]').value;
      const newPassword = await openDialog({
        tone: 'key',
        title: `Reset password for ${person}?`,
        message: 'They will be signed out. Share the new password privately and ask them to change it.',
        confirmLabel: 'Reset Password',
        field: { label: 'New password', placeholder: 'At least 8 characters', validate: (value) => (value.length >= 8 ? '' : 'Use at least 8 characters') },
      });
      if (newPassword === null) return;
      try {
        await api(`/api/users/${id}/password`, 'POST', { newPassword });
        if (Number(id) === me.id) {
          me = null;
          return renderLogin();
        }
        showAlert('msg', 'Password reset. That user has been signed out.', 'good');
      } catch (error) {
        showAlert('msg', error.message);
      }
      window.scrollTo(0, 0);
    };
  });
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
      <label>Type the new password again<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>
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
    const { currentPassword, newPassword, confirmPassword } = Object.fromEntries(new FormData(event.target));
    if (newPassword !== confirmPassword) {
      showAlert('msg', 'The two new passwords do not match. Nothing was changed.');
      window.scrollTo(0, 0);
      return;
    }
    try {
      await api('/api/password', 'POST', { currentPassword, newPassword });
      event.target.reset();
      showAlert('msg', '');
      showAlert('msg', 'Password changed', 'good');
    } catch (error) {
      showAlert('msg', error.message);
    }
  };
}

// ----- Customer decision on an approved bill -----
async function drawDecision(bill) {
  const box = document.getElementById('decision');
  if (bill.supersededBy) return;
  const reasons = bill.quoteStatus === 'waiting' ? await api('/api/quotation-reasons') : [];
  const send = async (path, body) => {
    try {
      await api(`/api/quotations/${bill.id}/${path}`, 'PUT', body);
      if (path === 'won') {
        location.hash = `#/project/${bill.id}`;
        showToast('Order won. It is now a project.');
        return;
      }
      route();
    } catch (error) {
      showAlert('msg', error.message);
      window.scrollTo(0, 0);
    }
  };
  const fields = (form) => Object.fromEntries(new FormData(form));

  if (bill.quoteStatus === 'waiting') {
    box.innerHTML = `
      <div class="card">
        <h2>Customer decision</h2>
        <form class="order" id="followUp">
          <label>Follow up on<input type="date" name="followUpOn" value="${esc(bill.followUpOn || '')}"></label>
          <button class="btn">Save Follow-up</button>
        </form>
        <div class="split decide">
          <form class="stack won-box" id="won">
            <h2>Order won</h2>
            <label>Order accepted on<input type="date" name="acceptedOn" value="${today()}" required></label>
            <button class="btn go">Mark as Won</button>
          </form>
          <form class="stack lost-box" id="lost">
            <h2>Order lost</h2>
            <label>Why was it lost?<select name="reason" required><option value="">Choose a reason</option>${reasons.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
            <label>Note<input name="note" maxlength="300" placeholder="Like: competitor quoted ₹620 per sq m"></label>
            <button class="btn danger">Mark as Lost</button>
          </form>
        </div>
      </div>`;
    document.getElementById('followUp').onsubmit = (event) => { event.preventDefault(); send('follow-up', fields(event.target)); };
    document.getElementById('won').onsubmit = (event) => { event.preventDefault(); send('won', fields(event.target)); };
    document.getElementById('lost').onsubmit = (event) => { event.preventDefault(); send('lost', fields(event.target)); };
    return;
  }

  const detail = bill.quoteStatus === 'won'
    ? `Order accepted on ${shortDate(bill.acceptedOn)}.`
    : `Lost: ${esc(bill.lostReason)}${bill.lostNote ? `. ${esc(bill.lostNote)}` : ''}`;
  const canInvoice = bill.quoteStatus === 'won' && !bill.invoiceNumber;
  box.innerHTML = `
    <div class="card decided">
      <div><h2>Customer decision</h2><p class="muted" style="margin:0">${detail}</p></div>
      ${bill.invoiceNumber ? '' : '<button class="btn" id="reopen">Reopen Quotation</button>'}
    </div>
    ${bill.invoiceNumber ? `<div class="card decided">
      <div><h2>Tax invoice ${esc(bill.invoiceNumber)}</h2><p class="muted" style="margin:0">Issued ${shortDate(bill.invoiceDate)}. This order is now locked.</p></div>
      <a class="btn go" href="/print/${bill.id}/tax-invoice" target="_blank" rel="noopener">Print Tax Invoice</a>
    </div>` : ''}
    ${canInvoice && me.role === 'admin' ? `<form class="card" id="invoice">
      <h2>Tax invoice</h2>
      <p class="muted" style="margin:-8px 0 12px">Check the bill first. Once issued, this order cannot be revised or reopened.</p>
      <div class="entry" style="margin:0;padding:0;border:0">
        <label>Invoice date<input type="date" name="date" value="${today()}" max="${today()}" required></label>
        <label>Place of supply (state code)<input name="stateCode" value="${esc(bill.customerStateCode)}" inputmode="numeric" maxlength="2" placeholder="Like 29" required></label>
        <button class="btn main">Create Tax Invoice</button>
      </div>
    </form>` : ''}
    ${canInvoice && me.role !== 'admin' ? '<p class="muted">The admin can create the tax invoice for this order.</p>' : ''}`;
  const invoiceForm = document.getElementById('invoice');
  if (invoiceForm) {
    invoiceForm.onsubmit = async (event) => {
      event.preventDefault();
      const sure = await openDialog({
        tone: 'warn',
        title: 'Create tax invoice?',
        message: 'This uses the next invoice number and cannot be undone. The order can no longer be revised or reopened.',
        confirmLabel: 'Create Invoice',
      });
      if (!sure) return;
      try {
        await api(`/api/bills/${bill.id}/tax-invoice`, 'POST', fields(invoiceForm));
        showToast('Tax invoice created');
        route();
      } catch (error) {
        showAlert('msg', error.message);
        window.scrollTo(0, 0);
      }
    };
  }
  const reopenButton = document.getElementById('reopen');
  if (!reopenButton) return;
  reopenButton.onclick = async () => {
    const sure = await openDialog({
      title: 'Reopen this quotation?',
      message: bill.quoteStatus === 'won'
        ? 'It will leave Projects and go back to waiting for the customer. The order date will be cleared.'
        : 'It will go back to waiting for the customer, and the lost reason will be cleared.',
      confirmLabel: 'Reopen',
    });
    if (sure) send('reopen');
  };
}

// ----- Quotation report -----
const monthStart = () => `${today().slice(0, 7)}-01`;
const report = { from: null, to: null, status: 'all' };

async function quotationsPage() {
  report.from = report.from || monthStart();
  report.to = report.to || today();
  const q = await api(`/api/quotations?from=${encodeURIComponent(report.from)}&to=${encodeURIComponent(report.to)}`);
  const shown = report.status === 'all' ? q.quotations : q.quotations.filter((x) => x.status === report.status);
  const rows = shown.map((x) => `
    <tr class="link" data-id="${x.id}">
      <td>${esc(x.number)}</td><td>${esc(x.customerName)}</td><td>${shortDate(x.sentOn)}</td><td>${quoteBadge(x.status)}</td>
      <td>${esc(x.lostReason)}${x.lostNote ? `<div class="muted">${esc(x.lostNote)}</div>` : ''}</td><td class="n">${money(x.value)}</td>
    </tr>`).join('');
  const followRows = q.followUps.map((x) => `
    <tr class="link" data-id="${x.id}">
      <td class="${x.followUpOn <= today() ? 'loss' : ''}">${shortDate(x.followUpOn)}</td><td>${esc(x.number)}</td><td>${esc(x.customerName)}</td>
      <td>${x.customerPhone ? `<a href="tel:${esc(x.customerPhone.replace(/[^+\d]/g, ''))}">${esc(x.customerPhone)}</a>` : ''}</td><td class="n">${money(x.value)}</td>
    </tr>`).join('');
  const biggest = Math.max(1, ...q.lostReasons.map((r) => r.count));
  shell('quotations', `
    <div class="head">
      <h1>Quotations</h1>
      <form class="range" id="range">
        <label>From<input type="date" name="from" value="${esc(report.from)}" required></label>
        <label>To<input type="date" name="to" value="${esc(report.to)}" required></label>
        <button class="btn">Show</button>
      </form>
    </div>
    <div id="msg"></div>
    <div class="stats">
      ${stat('Win rate', q.winRate === null ? 'No results yet' : `${q.winRate}%`, true)}
      ${stat('Quotations sent', q.sent)}
      ${stat('Won', q.won)}
      ${stat('Lost', q.lost)}
    </div>
    <div class="card">
      <div class="split">
        <div class="totals plain">
          <h2>Value before GST</h2>
          <div><span>Won</span><span>${money(q.valueWon)}</span></div>
          <div><span>Lost</span><span>${money(q.valueLost)}</span></div>
          <div><span>Waiting (${q.waiting})</span><span>${money(q.valueWaiting)}</span></div>
        </div>
        <div>
          <h2>Why orders were lost</h2>
          ${q.lostReasons.map((r) => `
            <div class="reason">
              <div class="reason-top"><span>${esc(r.reason)}</span><span>${r.count} · ${money(r.value)}</span></div>
              <div class="bar"><span style="width:${Math.round((r.count / biggest) * 100)}%"></span></div>
            </div>`).join('') || '<p class="muted">No lost orders in these dates.</p>'}
        </div>
      </div>
      <p class="muted" style="margin-bottom:0">Win rate is won ÷ (won + lost). Quotations still waiting are not counted. Dates use the day each bill was approved.</p>
    </div>
    ${q.followUps.length ? `<div class="card scroll">
      <h2>Follow-ups</h2>
      <table><tr><th>Call on</th><th>Bill</th><th>Customer</th><th>Phone</th><th class="n">Value</th></tr>${followRows}</table>
    </div>` : ''}
    <div class="card">
      <div class="head" style="margin-bottom:10px">
        <h2 style="margin:0">All quotations</h2>
        <select id="status" aria-label="Show status" style="max-width:220px;margin:0">
          ${[['all', 'All'], ['waiting', 'Waiting for customer'], ['won', 'Won'], ['lost', 'Lost']].map(([value, label]) => `<option value="${value}" ${report.status === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      ${shown.length ? `<div class="scroll"><table class="compact"><tr><th>Bill</th><th>Customer</th><th>Sent</th><th>Status</th><th>Reason</th><th class="n">Value</th></tr>${rows}</table></div>` : '<p class="muted">No quotations to show. Approved bills appear here.</p>'}
    </div>`);
  document.getElementById('range').onsubmit = (event) => {
    event.preventDefault();
    Object.assign(report, Object.fromEntries(new FormData(event.target)));
    quotationsPage();
  };
  document.getElementById('status').onchange = (event) => { report.status = event.target.value; quotationsPage(); };
  root.querySelectorAll('tr.link').forEach((row) => {
    row.onclick = (event) => { if (!event.target.closest('a')) location.hash = `#/bill/${row.dataset.id}`; };
  });
}

// ----- Shared pieces for money pages -----
const today = () => new Date().toLocaleDateString('en-CA');
const addOpen = () => (window.innerWidth > 640 ? 'open' : '');
const shortDate = (date) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');
const methodBadge = (method) => `<span class="badge ${method === 'cash' ? 'cash' : 'online'}">${method === 'cash' ? 'Cash' : 'Online'}</span>`;
const methodSelect = '<label>Paid by<select name="method"><option value="cash">Cash</option><option value="online">Online</option></select></label>';
const removeButton = (kind, id) => (me.role === 'admin' ? `<button class="btn small danger" data-delete="${kind}" data-id="${id}" aria-label="Delete entry">×</button>` : '');
const stat = (label, value, hot) => `<div class="stat ${hot ? 'hot' : ''}"><small>${esc(label)}</small><b>${esc(value)}</b></div>`;

// Connects add forms and delete buttons on a money page, then redraws it.
function wireMoneyPage(redraw) {
  root.querySelectorAll('form[data-post]').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        await api(form.dataset.post, 'POST', Object.fromEntries(new FormData(form)));
        await redraw();
        showAlert('msg', 'Saved', 'good');
      } catch (error) {
        showAlert('msg', error.message);
        window.scrollTo(0, 0);
      }
    };
  });
  root.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = async () => {
      const sure = await openDialog({
        tone: 'danger', title: 'Delete this entry?', message: 'Your totals will update straight away. This cannot be undone.', confirmLabel: 'Delete Entry', cancelLabel: 'Keep Entry',
      });
      if (!sure) return;
      try {
        await api(`/api/${button.dataset.delete}/${button.dataset.id}`, 'DELETE');
        await redraw();
      } catch (error) {
        showAlert('msg', error.message);
      }
    };
  });
}

// ----- Projects -----
async function projectsPage() {
  const projects = await api('/api/projects');
  const total = (key) => projects.reduce((sum, project) => sum + project[key], 0);
  const rows = projects.map((p) => `
    <tr class="link" data-id="${p.id}">
      <td>${esc(p.number)}</td><td>${esc(p.customerName)}</td><td>${shortDate(p.acceptedOn)}</td>
      <td class="n">${money(p.grandTotal)}</td><td class="n">${money(p.received)}</td><td class="n">${money(p.balance)}</td>
      <td class="n">${money(p.vendorPaid)}</td><td class="n ${p.profit < 0 ? 'loss' : 'gain'}">${money(p.profit)}</td>
    </tr>`).join('');
  shell('projects', `
    <div class="head"><h1>Projects</h1></div>
    <div class="stats">
      ${stat('Still to collect', money(total('balance')), true)}
      ${stat('Received', money(total('received')))}
      ${stat('Paid to vendors', money(total('vendorPaid')))}
      ${stat('Profit before shop expenses', money(total('profit')))}
    </div>
    <div class="card scroll">
      ${projects.length ? `<table class="compact"><tr><th>Bill</th><th>Customer</th><th>Order accepted</th><th class="n">Bill total</th><th class="n">Received</th><th class="n">Balance</th><th class="n">Vendors</th><th class="n">Profit</th></tr>${rows}</table>`
    : '<p class="muted">Quotations appear here as projects once they are marked as won.</p>'}
    </div>`);
  root.querySelectorAll('tr.link').forEach((row) => { row.onclick = () => { location.hash = `#/project/${row.dataset.id}`; }; });
}

async function projectPage(id) {
  const p = await api(`/api/projects/${id}`);
  const paymentRows = p.payments.map((x) => `
    <tr><td>${shortDate(x.date)}</td><td>${methodBadge(x.method)}</td><td>${esc(x.reference)}</td><td>${esc(x.note)}</td><td>${esc(x.created_by_name)}</td><td class="n">${money(x.amount)}</td><td>${removeButton('payments', x.id)}</td></tr>`).join('');
  const vendorRows = p.vendorPayments.map((x) => `
    <tr><td>${shortDate(x.date)}</td><td>${esc(x.vendor)}</td><td>${esc(x.description)}</td><td>${methodBadge(x.method)}</td><td>${esc(x.created_by_name)}</td><td class="n">${money(x.amount)}</td><td>${removeButton('vendor-payments', x.id)}</td></tr>`).join('');
  shell('projects', `
    <div class="head">
      <div><h1>${esc(p.number)}</h1><p class="muted" style="margin:4px 0 0">${esc(p.customerName)}</p></div>
      <a class="btn" href="#/bill/${p.id}">View Bill</a>
    </div>
    <div id="msg"></div>
    <div class="stats">
      ${stat('Balance to collect', money(p.balance), true)}
      ${stat('Received', money(p.received))}
      ${stat('Paid to vendors', money(p.vendorPaid))}
      ${stat('Profit', money(p.profit))}
    </div>
    <div class="card">
      <div class="split">
        <div class="totals plain">
          <div><span>Order value before GST</span><span>${money(p.orderValue)}</span></div>
          <div><span>GST</span><span>${money(p.gst)}</span></div>
          <div class="strong"><span>Bill total</span><span>${money(p.grandTotal)}</span></div>
        </div>
        <div class="totals plain">
          <div><span>Received in cash</span><span>${money(p.cash)}</span></div>
          <div><span>Received online</span><span>${money(p.online)}</span></div>
          <div class="strong"><span>Profit (order value − vendors)</span><span>${money(p.profit)}</span></div>
        </div>
      </div>
    </div>
    <form class="card order" id="order">
      <label>Order accepted on<input type="date" name="acceptedOn" value="${esc(p.acceptedOn || '')}"></label>
      <button class="btn">Save Date</button>
    </form>
    <div class="card">
      <h2>Customer payments</h2>
      ${p.payments.length ? `<div class="scroll"><table><tr><th>Date</th><th>Paid by</th><th>Reference</th><th>Note</th><th>Added by</th><th class="n">Amount</th><th></th></tr>${paymentRows}</table></div>` : '<p class="muted">No payments yet.</p>'}
      ${p.balance > 0 ? `<details class="adder" ${addOpen()}><summary>+ Add Payment</summary><form class="entry" data-post="/api/projects/${p.id}/payments">
        <label>Date<input type="date" name="date" value="${today()}" required></label>
        <label>Amount<input type="number" name="amount" min="0.01" max="${p.balance}" step="0.01" inputmode="decimal" required></label>
        ${methodSelect}
        <label>UPI or bank reference<input name="reference" maxlength="80"></label>
        <label>Note<input name="note" maxlength="300"></label>
        <button class="btn main">Add Payment</button>
      </form></details>` : '<p class="alert good">This bill is fully paid.</p>'}
    </div>
    <div class="card">
      <h2>Vendor payments</h2>
      ${p.vendorPayments.length ? `<div class="scroll"><table><tr><th>Date</th><th>Vendor</th><th>For</th><th>Paid by</th><th>Added by</th><th class="n">Amount</th><th></th></tr>${vendorRows}</table></div>` : '<p class="muted">No vendor payments yet.</p>'}
      <details class="adder" ${addOpen()}><summary>+ Add Vendor Payment</summary><form class="entry" data-post="/api/projects/${p.id}/vendor-payments">
        <label>Date<input type="date" name="date" value="${today()}" required></label>
        <label>Vendor<input name="vendor" maxlength="120" required></label>
        <label>Paid for<input name="description" maxlength="200"></label>
        <label>Amount<input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" required></label>
        ${methodSelect}
        <button class="btn main">Add Vendor Payment</button>
      </form></details>
    </div>`);
  document.getElementById('order').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(`/api/projects/${id}/order`, 'PUT', Object.fromEntries(new FormData(event.target)));
      showAlert('msg', 'Order date saved', 'good');
    } catch (error) {
      showAlert('msg', error.message);
    }
    window.scrollTo(0, 0);
  };
  wireMoneyPage(() => projectPage(id));
}

// ----- Monthly accounts -----
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Transport', 'Tools', 'Marketing', 'Other'];
let chosenMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);

async function accountsPage() {
  const a = await api(`/api/accounts?month=${encodeURIComponent(chosenMonth)}`);
  const rows = a.expenses.map((x) => `
    <tr><td>${shortDate(x.date)}</td><td>${esc(x.category)}</td><td>${esc(x.description)}</td><td>${methodBadge(x.method)}</td><td>${esc(x.created_by_name)}</td><td class="n">${money(x.amount)}</td><td>${removeButton('expenses', x.id)}</td></tr>`).join('');
  shell('accounts', `
    <div class="head">
      <h1>Monthly Accounts</h1>
      <label class="month">Month<input type="month" id="month" value="${esc(chosenMonth)}"></label>
    </div>
    <div id="msg"></div>
    <div class="stats">
      ${stat('Left over this month', money(a.leftOver), true)}
      ${stat('Money in', money(a.moneyIn))}
      ${stat('Paid to vendors', money(a.vendorPaid))}
      ${stat('Shop expenses', money(a.expensesTotal))}
    </div>
    <div class="card">
      <div class="split">
        <div class="totals plain">
          <h2>Money in</h2>
          <div><span>Cash</span><span>${money(a.cashIn)}</span></div>
          <div><span>Online</span><span>${money(a.onlineIn)}</span></div>
          <div class="strong"><span>Total</span><span>${money(a.moneyIn)}</span></div>
        </div>
        <div class="totals plain">
          <h2>Expenses by category</h2>
          ${a.byCategory.map((c) => `<div><span>${esc(c.category)}</span><span>${money(c.amount)}</span></div>`).join('') || '<p class="muted">No expenses this month.</p>'}
        </div>
      </div>
      <p class="muted" style="margin-bottom:0">Money in includes GST collected from customers, so left over is not the same as profit.</p>
    </div>
    <div class="card">
      <h2>Shop expenses</h2>
      ${a.expenses.length ? `<div class="scroll"><table><tr><th>Date</th><th>Category</th><th>Details</th><th>Paid by</th><th>Added by</th><th class="n">Amount</th><th></th></tr>${rows}</table></div>` : ''}
      <details class="adder" ${addOpen()}><summary>+ Add Expense</summary><form class="entry" data-post="/api/expenses">
        <label>Date<input type="date" name="date" value="${today()}" required></label>
        <label>Category<input name="category" list="categories" maxlength="60" required></label>
        <datalist id="categories">${EXPENSE_CATEGORIES.map((c) => `<option value="${c}">`).join('')}</datalist>
        <label>Details<input name="description" maxlength="200"></label>
        <label>Amount<input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" required></label>
        ${methodSelect}
        <button class="btn main">Add Expense</button>
      </form></details>
    </div>`);
  document.getElementById('month').onchange = (event) => {
    if (!event.target.value) return;
    chosenMonth = event.target.value;
    accountsPage();
  };
  wireMoneyPage(accountsPage);
}

// ----- Investment -----
async function investmentPage() {
  const data = await api('/api/investments');
  const rows = data.entries.map((x) => `
    <tr><td>${shortDate(x.date)}</td><td>${esc(x.person)}</td><td>${esc(x.paid_for)}</td><td>${methodBadge(x.method)}</td><td>${esc(x.note)}</td><td class="n">${money(x.amount)}</td><td>${removeButton('investments', x.id)}</td></tr>`).join('');
  shell('investment', `
    <div class="head"><h1>Shop Investment</h1></div>
    <div id="msg"></div>
    <div class="stats">
      ${stat('Total invested', money(data.total), true)}
      ${data.byPerson.slice(0, 3).map((p) => stat(p.person, money(p.amount))).join('')}
    </div>
    <div class="card">
      <h2>Paid for</h2>
      <div class="totals plain wide">
        ${data.byPurpose.map((p) => `<div><span>${esc(p.paidFor)}</span><span>${money(p.amount)}</span></div>`).join('') || '<p class="muted">Nothing added yet.</p>'}
      </div>
    </div>
    <div class="card">
      <h2>Investment entries</h2>
      ${data.entries.length ? `<div class="scroll"><table><tr><th>Date</th><th>Who paid</th><th>Paid for</th><th>Paid by</th><th>Note</th><th class="n">Amount</th><th></th></tr>${rows}</table></div>` : ''}
      <details class="adder" ${addOpen()}><summary>+ Add Investment</summary><form class="entry" data-post="/api/investments">
        <label>Date<input type="date" name="date" value="${today()}" required></label>
        <label>Who paid<select name="person" required>${data.people.map((name) => `<option>${esc(name)}</option>`).join('')}</select></label>
        <label>Paid for<input name="paidFor" maxlength="200" list="purposes" required></label>
        <datalist id="purposes">${data.byPurpose.map((p) => `<option value="${esc(p.paidFor)}">`).join('')}</datalist>
        <label>Amount<input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" required></label>
        ${methodSelect}
        <label>Note<input name="note" maxlength="300"></label>
        <button class="btn main">Add Investment</button>
      </form></details>
    </div>`);
  wireMoneyPage(investmentPage);
}

async function route() {
  if (!me) return renderLogin();
  const [page, id] = location.hash.replace(/^#\//, '').split('/');
  try {
    if (page === 'bill') await billPage(id);
    else if (page === 'quotations') await quotationsPage();
    else if (page === 'projects') await projectsPage();
    else if (page === 'project') await projectPage(id);
    else if (page === 'accounts') await accountsPage();
    else if (page === 'investment') await investmentPage();
    else if (page === 'enquiries') await enquiriesPage();
    else if (page === 'rates') await ratesPage();
    else if (page === 'settings') await settingsPage();
    else if (page === 'users' && me.role === 'admin') await usersPage();
    else if (page === 'account') accountPage();
    else await billsPage();
  } catch (error) {
    if (me) shell('', `<div class="alert bad">${esc(error.message)}</div><a class="btn" href="#/bills">Back to bills</a>`);
  }
}

// ----- Installing the app -----
let installEvent = null;
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIphone = () => !/android/i.test(navigator.userAgent)
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const canOfferInstall = () => !isInstalled() && (Boolean(installEvent) || isIphone() || window.innerWidth <= 860);

async function installApp() {
  if (installEvent) {
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    return;
  }
  await openDialog({
    tone: 'info',
    title: 'Install Safe View',
    message: isIphone()
      ? 'In Safari, tap the Share button, then Add to Home Screen, then Add.'
      : 'Open your browser menu, then tap Install app or Add to Home screen.',
    confirmLabel: 'Got It',
    cancelLabel: 'Later',
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  showToast('Safe View is installed');
});

function showConnection() {
  document.querySelector('.offline-bar')?.remove();
  if (navigator.onLine) return;
  const bar = document.createElement('div');
  bar.className = 'offline-bar';
  bar.setAttribute('role', 'status');
  bar.textContent = "You're offline. Changes can't be saved until you reconnect.";
  document.body.prepend(bar);
}
window.addEventListener('offline', showConnection);
window.addEventListener('online', () => {
  showConnection();
  showToast('Back online');
});
showConnection();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Every password box gets a show/hide button, so nobody is locked out by a typing mistake.
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.600 5.100A10 10 0 0 1 12 5c6.400 0 10 7 10 7a18 18 0 0 1-3.300 4.200M6.500 6.500A17 17 0 0 0 2 12s3.600 7 10 7a10 10 0 0 0 5.500-1.600M9.900 9.900a3 3 0 0 0 4.200 4.200"/></svg>';

function addPasswordToggles() {
  root.querySelectorAll('input[type=password]:not([data-eye])').forEach((input) => {
    input.dataset.eye = 'yes';
    const box = document.createElement('span');
    box.className = 'password-box';
    input.replaceWith(box);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-eye';
    button.innerHTML = EYE;
    button.setAttribute('aria-label', 'Show password');
    button.onclick = (event) => {
      event.preventDefault();
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.innerHTML = hidden ? EYE_OFF : EYE;
      button.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    };
    box.append(input, button);
  });
}

// On phones each table row becomes a card, and these labels stand in for the hidden column headings.
function labelTables() {
  root.querySelectorAll('table').forEach((table) => {
    const headings = [...table.querySelectorAll('tr:first-child th')].map((th) => th.textContent.trim());
    table.querySelectorAll('tr').forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName === 'TD' && cell.colSpan === 1) cell.dataset.label = headings[index] || '';
      });
    });
  });
}
new MutationObserver(() => {
  labelTables();
  addPasswordToggles();
}).observe(root, { childList: true, subtree: true });

window.addEventListener('hashchange', route);
api('/api/me').then((user) => { me = user; }).catch(() => {}).finally(route);
