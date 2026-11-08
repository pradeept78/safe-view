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
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { field: data.field });
  return data;
}

const ICONS = {
  bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  enquiries: '<path d="M4 5h16v11H9l-5 4zM8 10h8"/>',
  overview: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 7h6V4h-6zM4 20h6v-3H4z"/>',
  quotations: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13l2 2 4-4"/>',
  projects: '<path d="M3 7h7l2 3h9v10H3zM3 7V4h6l2 3"/>',
  accounts: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  investment: '<path d="M12 3v18M17 7c-1-2-3-3-5-3-3 0-5 1.500-5 4s2 3.500 5 4 5 1.500 5 4-2 4-5 4c-2 0-4-1-5-3"/>',
  rates: '<path d="M5 3h14v18H5zM12 3v18M5 12h14"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c.7-4 3.200-6 6.500-6s5.800 2 6.500 6M16 5a3.500 3.500 0 0 1 0 6.500M18 14c2 .8 3.200 2.800 3.500 6"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
};

const THEME_ICONS = `<svg class="theme-icon theme-to-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/></svg>
  <svg class="theme-icon theme-to-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400"/></svg>`;

function shell(active, content) {
  const link = (hash, label) => `<a href="#/${hash}" class="${active === hash ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[hash]}</svg>${label}</a>`;
  const tab = (hash, label) => `<a href="#/${hash}" class="${active === hash ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[hash]}</svg>${label}</a>`;
  const more = [['accounts', 'Monthly Accounts'], ['investment', 'Investment'], ['enquiries', 'Enquiries'], ['rates', 'Materials & Rates'], ...(me.role === 'admin' ? [['users', 'Users'], ['activity', 'Activity']] : []), ['settings', 'Settings'], ['account', 'My Account']];
  const moreActive = more.some(([hash]) => hash === active);
  const navScroll = root.querySelector('.side nav')?.scrollTop || 0;
  root.innerHTML = `
    <div class="layout">
      <aside class="side">
        <img src="/img/word-t.png" alt="Safe View Glass Solutions">
        <button type="button" class="quick-btn" id="quickAdd"><span aria-hidden="true">+</span> Quick add</button>
        <nav aria-label="Dashboard">${link('overview', 'Overview')}${link('bills', 'Bills')}${link('quotations', 'Quotations')}${link('projects', 'Projects')}${link('accounts', 'Monthly Accounts')}${link('investment', 'Investment')}${link('enquiries', 'Enquiries')}${link('rates', 'Materials & Rates')}${me.role === 'admin' ? link('users', 'Users') + link('activity', 'Activity') : ''}${link('settings', 'Settings')}${link('account', 'My Account')}</nav>
        <div class="who">
          <a class="avatar" href="#/account" aria-label="My Account">${esc(me.name.charAt(0).toUpperCase())}</a>
          <div><b>${esc(me.name)}</b><span>${me.role === 'admin' ? 'Admin' : 'Partner'}</span></div>
          <button type="button" id="themeBtn" aria-label="Switch between light and dark theme" title="Switch theme">${THEME_ICONS}</button>
          <button id="logout" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H10"/></svg></button>
        </div>
      </aside>
      <main class="wrap">${content}</main>
      <nav class="tabbar" aria-label="Main">
        ${tab('overview', 'Overview')}${tab('bills', 'Bills')}${tab('quotations', 'Quotes')}${tab('projects', 'Projects')}
        <button type="button" class="${moreActive ? 'on' : ''}" id="moreBtn" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.500"/><circle cx="12" cy="12" r="1.500"/><circle cx="19" cy="12" r="1.500"/></svg>More</button>
      </nav>
      <div class="sheet" id="moreSheet" hidden>
        <div class="sheet-panel">
          <p class="sheet-who">${esc(me.name)} · ${me.role === 'admin' ? 'Admin' : 'Partner'}</p>
          ${more.map(([hash, label]) => link(hash, label)).join('')}
          ${canOfferInstall() ? '<button type="button" class="sheet-install" id="sheetInstall">Install App</button>' : ''}
          <button type="button" class="sheet-theme" id="sheetTheme">${THEME_ICONS}<span class="theme-to-dark">Dark theme</span><span class="theme-to-light">Light theme</span></button>
          <button type="button" id="sheetLogout">Sign out</button>
        </div>
      </div>
    </div>`;
  root.querySelector('.side nav').scrollTop = navScroll;
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
  document.getElementById('quickAdd').onclick = () => openQuickAdd();
  const flipTheme = () => window.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  document.getElementById('themeBtn').onclick = flipTheme;
  document.getElementById('sheetTheme').onclick = flipTheme;
  document.getElementById('logout').onclick = signOut;
  document.getElementById('sheetLogout').onclick = signOut;
  showEnquiryBadge();
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

// Open on a laptop. On a phone it folds to one line, which keeps long pages short.
const fold = (title, content) => `<details class="fold" ${window.innerWidth > 640 ? 'open' : ''}><summary>${esc(title)}</summary>${content}</details>`;

// A row of tap filters. The caller decides what a tap does.
const chips = (id, label, options, chosen) => `<div class="chips" id="${id}" role="group" aria-label="${label}">
  ${options.map(([value, text]) => `<button type="button" data-value="${value}" aria-pressed="${value === chosen}">${text}</button>`).join('')}
</div>`;

function wireChips(id, onPick) {
  const box = document.getElementById(id);
  const buttons = [...box.querySelectorAll('button')];
  const chosen = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
  if (chosen) box.scrollLeft = chosen.offsetLeft - box.offsetLeft - 8;
  buttons.forEach((button) => {
    button.onclick = () => {
      buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      onPick(button.dataset.value);
    };
  });
}

// ----- Bills list -----
const billList = { q: '', status: 'all', items: [], total: 0 };
const BILL_FILTER_LABELS = [['all', 'All bills'], ['draft', 'Drafts'], ['pending', 'Waiting for admin'], ['waiting', 'Waiting for customer'], ['won', 'Won'], ['lost', 'Lost'], ['revised', 'Old versions']];

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
      <div class="stat hot"><small>Approved this month</small><b>${wholeMoney(stats.approvedThisMonth)}</b></div>
      <div class="stat"><small>Waiting for approval</small><b>${stats.waiting}</b></div>
      <div class="stat"><small>Drafts</small><b>${stats.drafts}</b></div>
      <div class="stat"><small>New enquiries</small><b>${newEnquiries}</b></div>
    </div>
    ${me.role === 'admin' && stats.waiting ? `<div class="alert warn">${stats.waiting} bill${stats.waiting > 1 ? 's are' : ' is'} waiting for your approval.</div>` : ''}
    <div class="finder">
      <input id="billSearch" type="search" aria-label="Search bills" placeholder="Search customer, phone or bill number" value="${esc(billList.q)}">
    </div>
    ${chips('billStatus', 'Show bills', BILL_FILTER_LABELS, billList.status)}
    <div class="card scroll" id="billResults"></div>`);
  drawBillResults();
  let timer;
  document.getElementById('billSearch').oninput = (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => { billList.q = event.target.value.trim(); loadBills(); }, 250);
  };
  wireChips('billStatus', (status) => { billList.status = status; loadBills(); });
}

// ----- Bill editor -----
function wireCustomerPicker() {
  const box = document.getElementById('customerMatches');
  const fill = { customerName: 'name', customerPhone: 'phone', customerAddress: 'address', customerGstin: 'gstin', customerStateCode: 'stateCode' };
  let timer;
  let latest = 0;
  const hide = () => { latest += 1; box.hidden = true; box.innerHTML = ''; };
  const search = async (query) => {
    latest += 1;
    const ticket = latest;
    const matches = query.length < 2 ? [] : await api(`/api/customers?q=${encodeURIComponent(query)}`).catch(() => []);
    if (ticket !== latest) return;
    box.hidden = !matches.length;
    box.innerHTML = matches.length ? `<small>Past customers</small>${matches.map((customer, index) => `
      <button type="button" data-index="${index}"><b>${esc(customer.name)}</b><span>${esc([customer.phone, customer.address].filter(Boolean).join(' · '))}</span></button>`).join('')}` : '';
    box.querySelectorAll('button').forEach((button) => {
      button.onclick = () => {
        const customer = matches[button.dataset.index];
        Object.entries(fill).forEach(([id, key]) => { document.getElementById(id).value = customer[key]; });
        if (customer.address || customer.gstin || customer.stateCode) document.getElementById('customerMore').open = true;
        hide();
      };
    });
  };
  ['customerName', 'customerPhone'].forEach((id) => {
    document.getElementById(id).oninput = (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => search(event.target.value.trim()), 200);
    };
  });
}

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
  const showMore = window.innerWidth > 640 || (editable && ['customerAddress', 'customerGstin', 'customerStateCode', 'projectRemark'].some((key) => bill?.[key]));

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
        <div class="wide matches" id="customerMatches" hidden></div>
      </div>
      <details class="more-fields" id="customerMore" ${showMore ? 'open' : ''}>
        <summary>Address, GST and remark</summary>
        <div class="grid">
          <label class="wide">Address<input id="customerAddress" value="${v('customerAddress')}" ${off}></label>
          <label>GST number<input id="customerGstin" value="${v('customerGstin')}" ${off}></label>
          <label>State code<input id="customerStateCode" value="${v('customerStateCode')}" ${off}></label>
          <label class="wide">Project remark<input id="projectRemark" value="${v('projectRemark')}" ${off}></label>
        </div>
      </details>
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
  if (editable) wireCustomerPicker();

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

  function drawFixedLines() {
    const table = document.getElementById('lines');
    table.classList.add('fixed-lines');
    table.innerHTML = `<tr><th>Material</th><th>Size (mm)</th><th>Qty</th><th>Rate / sq m</th><th>GST %</th><th class="n">Area</th><th class="n">Amount</th></tr>
      ${state.lines.map((line, i) => `<tr data-i="${i}">
        <td>${esc(line.glassName)}</td><td>${esc(line.widthMm)} × ${esc(line.heightMm)}</td><td>${esc(line.qty)}</td>
        <td>${money(line.rate)}<div class="hint" data-hint>${rateHint(line, i)}</div></td><td>${esc(line.gstPercent)}%</td>
        <td class="n" data-area>–</td><td class="n" data-amount>–</td>
      </tr>`).join('')}`;
  }

  function drawLines() {
    if (!editable) {
      drawFixedLines();
      return;
    }
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
  const row = (g) => `<div class="item">
    <div class="item-main">
      <b>${esc(g.name)}</b>
      <small>${[g.hsn ? `HSN ${esc(g.hsn)}` : '', `${esc(g.thickness_mm)} mm`, `${esc(g.gst_percent)}% GST`].filter(Boolean).join(' · ')}</small>
    </div>
    <div class="item-amount">${money(g.rate)}<small>per sq m</small></div>
    ${isAdmin ? `<div class="item-actions">
      <button type="button" class="icon-btn" data-edit="${g.id}" aria-label="Edit ${esc(g.name)}" title="Edit">${PENCIL}</button>
      <button type="button" class="icon-btn danger" data-del="${g.id}" aria-label="Remove ${esc(g.name)}" title="Remove">×</button>
    </div>` : ''}
  </div>`;
  shell('rates', `
    <div class="head"><h1>Materials &amp; Rates</h1>${isAdmin ? '<button type="button" class="btn main" id="addMaterial">+ Add Material</button>' : ''}</div>
    <div id="msg"></div>
    <div class="card items">${glass.map(row).join('') || '<p class="muted" style="margin:0">No materials yet.</p>'}</div>
    <p class="muted">${isAdmin ? 'These fill in the material dropdown on every new bill, with the rate and GST. Rates are per square metre. Changing a rate or GST does not change bills already made.' : 'Only the admin can change materials and rates.'}</p>`);
  const materialPopup = (g) => openFormPopup({
    title: g ? 'Edit material' : 'Add a material',
    fields: `<label>Material name<input name="name" value="${esc(g?.name || '')}" placeholder="Like: 8MM CLEAR TOUGHENED GLASS" maxlength="120" autocapitalize="characters" autocomplete="off"></label>
      <label class="half">HSN<input name="hsn" value="${esc(g?.hsn || '')}" inputmode="numeric" maxlength="20" autocomplete="off"></label>
      <label class="half">Thickness (mm)<input name="thickness_mm" type="number" step="0.1" min="0" value="${esc(g?.thickness_mm ?? '')}" inputmode="decimal"></label>
      <label class="half">Rate per sq m<input name="rate" type="number" step="0.01" min="0" value="${esc(g?.rate ?? '')}" inputmode="decimal"></label>
      <label class="half">GST %<input name="gst_percent" type="number" step="0.01" min="0" max="100" value="${esc(g?.gst_percent ?? settings.default_gst_percent)}" inputmode="decimal"></label>`,
    note: g ? 'Bills already made keep their old rate.' : '',
    saveLabel: g ? 'Save' : 'Add Material',
    onSave: async (body) => {
      await api(g ? `/api/glass-types/${g.id}` : '/api/glass-types', g ? 'PUT' : 'POST', body);
      await ratesPage();
      showToast('Saved');
    },
  });
  const add = document.getElementById('addMaterial');
  if (add) add.onclick = () => materialPopup(null);
  root.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => materialPopup(glass.find((g) => String(g.id) === button.dataset.edit));
  });
  root.querySelectorAll('[data-del]').forEach((button) => {
    const g = glass.find((item) => String(item.id) === button.dataset.del);
    button.onclick = async () => {
      const sure = await openDialog({
        tone: 'danger', title: `Remove ${g.name}?`, message: 'It will no longer appear on new bills. Bills already made keep it.', confirmLabel: 'Remove', cancelLabel: 'Keep It',
      });
      if (!sure) return;
      try {
        await api(`/api/glass-types/${g.id}`, 'DELETE');
        await ratesPage();
        showToast('Removed');
      } catch (error) {
        showAlert('msg', error.message);
      }
    };
  });
}

// ----- Settings -----
const SETTING_TABS = [
  ['business', 'Business', [
    ['business_name', 'Business name'], ['tagline', 'Tagline'], ['address', 'Address', { wide: true }],
    ['gstin', 'GST number', { hint: '15 characters, like 29ABCDE1234F1Z5', caps: true, max: 15 }], ['phone', 'Phone', { mode: 'tel' }],
    ['whatsapp', 'WhatsApp number', { hint: 'With country code, like 919876543210', mode: 'tel' }], ['email', 'Email', { mode: 'email' }],
    ['opening_hours', 'Opening hours'], ['jurisdiction', 'Jurisdiction city'],
  ]],
  ['bank', 'Bank', [
    ['bank_name', 'Bank name'], ['bank_account', 'Account number', { mode: 'numeric' }],
    ['bank_ifsc', 'IFSC', { hint: '11 characters, like HDFC0001234', caps: true, max: 11 }], ['bank_branch', 'Branch'],
  ]],
  ['bills', 'Bills', [
    ['default_allowance_mm', 'Default allowance (mm)', { mode: 'numeric' }], ['default_gst_percent', 'GST % for manual items', { mode: 'decimal' }],
    ['next_bill_number', 'Next bill number', { mode: 'numeric', hint: 'The number the next approved bill will get' }],
  ]],
];
const settingsView = { tab: 'business' };

async function settingsPage() {
  const settings = await api('/api/settings');
  const off = me.role === 'admin' ? '' : 'disabled';
  const field = ([key, label, { wide, hint, caps, max, mode } = {}]) => `<label class="${wide ? 'wide' : ''}">${esc(label)}
    <input name="${key}" value="${esc(settings[key])}" ${mode ? `inputmode="${mode}"` : ''} ${max ? `maxlength="${max}"` : ''} ${caps ? 'autocapitalize="characters"' : ''} ${off}>
    ${hint ? `<small class="field-hint">${esc(hint)}</small>` : ''}</label>`;
  const panel = (name) => `data-panel="${name}" ${settingsView.tab === name ? '' : 'hidden'}`;
  shell('settings', `
    <div class="head"><h1>Settings</h1></div>
    <div id="msg"></div>
    <nav class="tabs" aria-label="Settings sections">
      ${SETTING_TABS.map(([name, label]) => `<button type="button" data-tab="${name}" ${settingsView.tab === name ? 'aria-current="true"' : ''}>${label}</button>`).join('')}
    </nav>
    <form class="card" id="form" novalidate>
      ${SETTING_TABS.map(([name, , fields]) => `<section ${panel(name)}><div class="grid">
        ${fields.map(field).join('')}
        ${name === 'bills' ? `<label class="wide">Terms printed on bills<textarea name="terms" rows="8" ${off}>${esc(settings.terms)}</textarea></label>` : ''}
      </div></section>`).join('')}
      ${off ? '<p class="muted">Only the admin can change settings.</p>' : '<p class="acts"><button class="btn main">Save Settings</button></p>'}
    </form>`);
  const form = document.getElementById('form');
  const openTab = (name) => {
    settingsView.tab = name;
    root.querySelectorAll('[data-tab]').forEach((tab) => {
      if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'true');
      else tab.removeAttribute('aria-current');
    });
    root.querySelectorAll('[data-panel]').forEach((section) => { section.hidden = section.dataset.panel !== name; });
  };
  root.querySelectorAll('[data-tab]').forEach((button) => { button.onclick = () => openTab(button.dataset.tab); });
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const saved = await api('/api/settings', 'PUT', Object.fromEntries(new FormData(form)));
      Object.entries(saved).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
      showAlert('msg', '');
      showAlert('msg', 'Settings saved', 'good');
    } catch (error) {
      showAlert('msg', error.message);
      window.scrollTo(0, 0);
      // All tabs save together, so show the tab that holds the mistake.
      const input = form.elements[error.field];
      if (input) {
        openTab(input.closest('[data-panel]').dataset.panel);
        input.focus({ preventScroll: true });
      }
    }
  };
}

// ----- New enquiry badge -----
let enquiryCheck = { at: 0, count: 0 };

async function showEnquiryBadge() {
  if (Date.now() - enquiryCheck.at > 30000) {
    const list = await api('/api/enquiries').catch(() => null);
    if (!list) return;
    enquiryCheck = { at: Date.now(), count: list.filter((e) => e.status === 'new').length };
  }
  const { count } = enquiryCheck;
  root.querySelectorAll('a[href="#/enquiries"], #moreBtn').forEach((item) => {
    item.querySelector('.count')?.remove();
    if (!count) return;
    const dot = document.createElement('span');
    dot.className = 'count';
    dot.textContent = count > 9 ? '9+' : String(count);
    dot.setAttribute('aria-label', `${count} new enquiries`);
    item.append(dot);
  });
}

// ----- Activity log -----
const activityList = { items: [], total: 0 };

function drawActivity() {
  const box = document.getElementById('activityResults');
  if (!box) return;
  const rows = activityList.items.map((a) => `
    <tr><td>${esc(when(a.created_at))}</td><td>${esc(a.who)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join('');
  box.innerHTML = activityList.items.length ? `
    <table class="ledger"><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>${rows}</table>
    <p class="muted list-count">Showing ${activityList.items.length} of ${activityList.total}</p>
    ${activityList.items.length < activityList.total ? '<button class="btn load-more" id="moreActivity">Load More</button>' : ''}`
    : '<p class="muted">Nothing recorded yet.</p>';
  const more = document.getElementById('moreActivity');
  if (more) {
    more.onclick = async () => {
      const next = await api(`/api/activity?limit=25&offset=${activityList.items.length}`);
      activityList.items.push(...next.entries);
      activityList.total = next.total;
      drawActivity();
    };
  }
}

async function activityPage() {
  const first = await api('/api/activity?limit=25');
  activityList.items = first.entries;
  activityList.total = first.total;
  shell('activity', `
    <div class="head"><h1>Activity</h1></div>
    <p class="muted" style="margin:-10px 0 14px">Who did what, starting from when this log was added. Passwords are never recorded.</p>
    <div class="card scroll" id="activityResults"></div>`);
  drawActivity();
}

// ----- Users -----
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16zM13.500 6.500l4 4"/></svg>';
const roleOptions = (role) => `<option value="partner" ${role === 'partner' ? 'selected' : ''}>Partner</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>`;

async function usersPage() {
  const users = await api('/api/users');
  const row = (u) => `<div class="item">
    <span class="avatar small" aria-hidden="true">${esc(u.name.charAt(0).toUpperCase())}</span>
    <div class="item-main">
      <b>${esc(u.name)}</b>
      <small>Signs in as ${esc(u.username)}</small>
    </div>
    <div class="item-tags">
      <span class="badge ${u.role === 'admin' ? 'approved' : 'contacted'}">${u.role === 'admin' ? 'Admin' : 'Partner'}</span>
      ${u.active ? '' : '<span class="badge closed">Cannot sign in</span>'}
    </div>
    <div class="item-actions">
      <button type="button" class="icon-btn" data-edit="${u.id}" aria-label="Edit ${esc(u.name)}" title="Edit">${PENCIL}</button>
      <button type="button" class="btn small reset-btn" data-password="${u.id}" aria-label="Reset password for ${esc(u.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l3 3"/></svg><span>Reset Password</span></button>
    </div>
  </div>`;
  shell('users', `
    <div class="head"><h1>Users</h1><button type="button" class="btn main" id="addUser">+ Add User</button></div>
    <div id="msg"></div>
    <div class="card items">${users.map(row).join('')}</div>
    <p class="muted">Admins approve bills and manage users. Partners make bills and add entries. If you change a username, tell that person, because they sign in with the new one. To remove someone, untick Can sign in, so their name stays on past bills.</p>`);
  document.getElementById('addUser').onclick = () => openFormPopup({
    title: 'Add a user',
    fields: `<label>Name<input name="name" maxlength="80" autocomplete="off"></label>
      <label class="half">Username<input name="username" maxlength="40" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
      <label class="half">Role<select name="role">${roleOptions('partner')}</select></label>
      <label>First password (at least 8 characters)<input name="password" type="password" autocomplete="new-password"></label>`,
    note: 'Share the password privately, and ask them to change it under My Account.',
    saveLabel: 'Add User',
    onSave: async (body) => {
      await api('/api/users', 'POST', body);
      await usersPage();
      showToast('User added');
    },
  });
  root.querySelectorAll('[data-edit]').forEach((button) => {
    const user = users.find((u) => String(u.id) === button.dataset.edit);
    button.onclick = () => openFormPopup({
      title: `Edit ${user.name}`,
      fields: `<label>Name printed on bills<input name="name" value="${esc(user.name)}" maxlength="80" autocomplete="off"></label>
        <label class="half">Username<input name="username" value="${esc(user.username)}" maxlength="40" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
        <label class="half">Role<select name="role">${roleOptions(user.role)}</select></label>
        <label class="check"><input type="checkbox" name="active" ${user.active ? 'checked' : ''}> Can sign in</label>`,
      saveLabel: 'Save',
      onSave: async (body) => {
        const saved = await api(`/api/users/${user.id}`, 'PUT', { ...body, active: body.active === 'on' });
        if (saved.id === me.id) me = { ...me, username: saved.username, name: saved.name, role: saved.role };
        if (me.role !== 'admin') return route();
        await usersPage();
        showToast('Saved');
      },
    });
  });
  root.querySelectorAll('[data-password]').forEach((button) => {
    const user = users.find((u) => String(u.id) === button.dataset.password);
    button.onclick = async () => {
      const newPassword = await openDialog({
        tone: 'key',
        title: `Reset password for ${user.name}?`,
        message: 'They will be signed out. Share the new password privately and ask them to change it.',
        confirmLabel: 'Reset Password',
        field: { label: 'New password', placeholder: 'At least 8 characters', validate: (value) => (value.length >= 8 ? '' : 'Use at least 8 characters') },
      });
      if (newPassword === null) return;
      try {
        await api(`/api/users/${user.id}/password`, 'POST', { newPassword });
        if (user.id === me.id) {
          me = null;
          return renderLogin();
        }
        showToast('Password reset. They have been signed out.');
      } catch (error) {
        showAlert('msg', error.message);
        window.scrollTo(0, 0);
      }
    };
  });
}

// ----- My account -----
// A small form in a popup. A mistake shows inside the popup, so it stays open and in view.
function openFormPopup({ title, fields, note, saveLabel, onSave }) {
  const returnFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay quick-overlay';
  overlay.innerHTML = `<form class="dialog quick" role="dialog" aria-modal="true" aria-labelledby="popupTitle" novalidate>
    <div class="quick-head"><h2 id="popupTitle">${esc(title)}</h2><button type="button" class="quick-close" aria-label="Close">×</button></div>
    <div class="popup-fields">${fields}</div>
    ${note ? `<p class="muted popup-note">${esc(note)}</p>` : ''}
    <p class="dialog-error" id="popupError" role="alert"></p>
    <div class="dialog-actions quick-foot"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn main">${esc(saveLabel)}</button></div>
  </form>`;
  document.body.append(overlay);
  addPasswordToggles(overlay);
  const form = overlay.querySelector('form');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    returnFocus?.focus?.();
  };
  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const items = [...form.querySelectorAll('button, input')].filter((item) => item.offsetParent);
    const edge = event.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  }
  document.addEventListener('keydown', onKey);
  overlay.onclick = (event) => { if (event.target === overlay) close(); };
  form.querySelector('.quick-close').onclick = close;
  form.querySelector('[data-cancel]').onclick = close;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const save = form.querySelector('.btn.main');
    save.disabled = true;
    try {
      await onSave(Object.fromEntries(new FormData(form)));
      close();
    } catch (error) {
      form.querySelector('#popupError').textContent = error.message;
      save.disabled = false;
    }
  };
  form.querySelector('input').focus();
}

function accountPage() {
  shell('account', `
    <div class="head"><h1>My Account</h1></div>
    <div id="msg"></div>
    <div class="card profile-card">
      <span class="avatar" aria-hidden="true">${esc(me.name.charAt(0).toUpperCase())}</span>
      <div class="profile-who">
        <div class="profile-name">
          <h2>${esc(me.name)}</h2>
          <button type="button" class="icon-btn" id="editName" aria-label="Edit name" title="Edit name"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16zM13.500 6.500l4 4"/></svg></button>
        </div>
        <p class="muted">Signs in as <b>${esc(me.username)}</b></p>
      </div>
      <span class="badge ${me.role === 'admin' ? 'approved' : 'contacted'}">${me.role === 'admin' ? 'Admin' : 'Partner'}</span>
      <div class="profile-foot">
        <button type="button" class="btn" id="changePassword">Change Password</button>
        <p class="muted">${me.role === 'admin' ? 'To change a username, go to <a href="#/users">Users</a>.' : 'Only your admin can change your username.'}</p>
      </div>
    </div>`);
  document.getElementById('editName').onclick = () => openFormPopup({
    title: 'Edit name',
    fields: `<label>Name printed on bills<input name="name" value="${esc(me.name)}" maxlength="80" autocomplete="name"></label>`,
    saveLabel: 'Save Name',
    onSave: async (body) => {
      me = await api('/api/me', 'PUT', body);
      accountPage();
      showToast('Name saved');
    },
  });
  document.getElementById('changePassword').onclick = () => openFormPopup({
    title: 'Change password',
    fields: `<label>Current password<input name="currentPassword" type="password" autocomplete="current-password"></label>
      <label>New password (at least 8 characters)<input name="newPassword" type="password" autocomplete="new-password"></label>
      <label>Type the new password again<input name="confirmPassword" type="password" autocomplete="new-password"></label>`,
    note: 'This signs you out on your other devices.',
    saveLabel: 'Change Password',
    onSave: async ({ currentPassword, newPassword, confirmPassword }) => {
      if (newPassword !== confirmPassword) throw new Error('The two new passwords do not match. Nothing was changed.');
      await api('/api/password', 'POST', { currentPassword, newPassword });
      showToast('Password changed');
    },
  });
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

// ----- Business overview -----
const shortMoney = (value) => {
  const amount = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (amount >= 10000000) return `${sign}₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${sign}₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${sign}₹${(amount / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(amount)}`;
};
const monthName = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });
const monthLong = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const wholeMoney = (value) => money(Math.round(value)).replace(/\.00$/, '');
const kpi = (label, value, note, tone) => `<div class="kpi ${tone}"><small>${esc(label)}</small><b>${esc(value)}</b><span>${esc(note)}</span></div>`;

// Rounds a chart's top up to a tidy number, so the scale reads ₹50K and not ₹47.3K.
function tidyTop(value) {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  const scaled = value / step;
  return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((tidy) => scaled <= tidy) * step;
}

function trendCard(months) {
  const best = months.reduce((top, month) => (month.sales > top.sales ? month : top), months[0]);
  const hasData = months.some((month) => month.sales !== 0 || month.confirmedProfit !== 0);
  return `<div class="card chart">
    <div class="chart-head"><h2>Sales and profit</h2><span class="muted">Last 12 months</span></div>
    ${hasData ? `<p class="chart-note">${best.sales > 0 ? `Best month: <b>${esc(monthLong(best.month))}, ${esc(wholeMoney(best.sales))}</b> in sales.` : 'No sales in these months.'}</p>
    <div class="legend"><span><i class="sales"></i>Sales</span><span><i class="profit"></i>Confirmed profit</span><span class="readout" id="trendReadout"></span></div>
    <div class="trend" id="trend" tabindex="0" role="img" aria-label="Sales and confirmed profit for the last 12 months. Use the left and right arrow keys to read a month."></div>`
    : '<p class="muted chart-empty">Nothing to show yet. This fills in as you win orders and complete projects.</p>'}
  </div>`;
}

// Drawn at the real pixel width, so labels stay the same size on a phone.
function wireTrend(months) {
  const box = document.getElementById('trend');
  if (!box) return;
  const readout = document.getElementById('trendReadout');
  const last = months.length - 1;
  let picked = last;
  let drawnWidth = 0;
  const left = 48;
  const right = 14;
  const draw = () => {
    const width = box.clientWidth;
    if (!width) return;
    drawnWidth = width;
    const height = width < 480 ? 165 : 230;
    const floor = height - 26;
    const values = months.flatMap((month) => [month.sales, month.confirmedProfit]);
    const top = tidyTop(Math.max(...values, 0));
    const lowest = Math.min(...values, 0);
    const bottom = lowest < 0 ? -tidyTop(-lowest) : 0;
    const x = (index) => left + (index * (width - left - right)) / last;
    const y = (value) => 14 + ((top - value) / (top - bottom)) * (floor - 14);
    const line = (key) => months.map((month, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(month[key]).toFixed(1)}`).join(' ');
    const area = `${line('sales')} L${x(last).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
    const every = width < 480 ? 3 : width < 700 ? 2 : 1;
    const month = months[picked];
    box.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-opacity=".24"/><stop offset="100%" stop-opacity="0"/></linearGradient></defs>
      ${[...new Set([top, top / 2, 0, bottom])].map((tick) => `<line class="grid-line" x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="${left - 8}" y="${y(tick) + 4}" text-anchor="end">${esc(shortMoney(tick).replace('.0', ''))}</text>`).join('')}
      <path d="${area}" fill="url(#salesFill)"/>
      <path class="trend-line sales" d="${line('sales')}"/>
      <path class="trend-line profit" d="${line('confirmedProfit')}"/>
      <line class="pick-line" x1="${x(picked)}" x2="${x(picked)}" y1="14" y2="${floor}"/>
      <circle class="pick-dot sales" cx="${x(picked)}" cy="${y(month.sales)}" r="5"/>
      <circle class="pick-dot profit" cx="${x(picked)}" cy="${y(month.confirmedProfit)}" r="5"/>
      ${months.map((item, index) => ((last - index) % every ? '' : `<text class="axis" x="${x(index)}" y="${height - 6}" text-anchor="${index === last ? 'end' : index === 0 ? 'start' : 'middle'}">${esc(monthName(item.month))}</text>`)).join('')}
    </svg>`;
    readout.textContent = `${monthLong(month.month)}: ${wholeMoney(month.sales)} sales, ${wholeMoney(month.confirmedProfit)} profit`;
  };
  const pick = (index) => {
    const next = Math.max(0, Math.min(last, index));
    if (next !== picked) { picked = next; draw(); }
  };
  const pointAt = (event) => {
    const offset = event.clientX - box.getBoundingClientRect().left - left;
    pick(Math.round((offset / (box.clientWidth - left - right)) * last));
  };
  box.onpointermove = pointAt;
  box.onpointerdown = pointAt;
  box.onpointerleave = (event) => { if (event.pointerType === 'mouse') pick(last); };
  box.onkeydown = (event) => {
    if (event.key === 'ArrowLeft') pick(picked - 1);
    if (event.key === 'ArrowRight') pick(picked + 1);
  };
  draw();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (box.clientWidth !== drawnWidth) draw(); }).observe(box);
}

// Each theme's colours passed the colour-blind check in this order, so keep the order.
const SPLIT_COLOURS = { Glass: 'var(--split-glass)', Installation: 'var(--split-installation)', Transport: 'var(--split-transport)', 'Other costs': 'var(--split-other)', 'Shop expenses': 'var(--split-shop)', 'Left over': 'var(--split-left)' };

function splitCard(o) {
  const head = '<div class="chart-head"><h2>Where your sales money goes</h2></div>';
  if (o.sales <= 0) return `<div class="card chart">${head}<p class="muted chart-empty">Nothing to show yet. This fills in as you win orders.</p></div>`;
  const { costs, expenses, left } = o.split;
  const parts = [...costs.map(({ type, amount }) => ({ label: type, amount })), { label: 'Shop expenses', amount: expenses }, { label: 'Left over', amount: left }].filter((part) => part.amount > 0);
  const spent = o.sales - left;
  const share = (amount) => `${Math.round((amount / o.sales) * 100)}%`;
  const base = Math.max(o.sales, spent);
  return `<div class="card chart">
    ${head}
    <p class="chart-note">${left >= 0 ? `<b>${share(spent)}</b> spent, <b class="gain">${esc(wholeMoney(left))}</b> (${share(left)}) left from ${esc(wholeMoney(o.sales))} sales.` : `Costs and expenses are <b class="loss">${esc(wholeMoney(-left))}</b> more than sales.`}</p>
    <div class="split-bar" role="img" aria-label="Sales money split, listed below">${parts.map((part) => `<i title="${esc(part.label)} ${esc(wholeMoney(part.amount))}" style="flex-grow:${part.amount / base};background:${SPLIT_COLOURS[part.label]}"></i>`).join('')}</div>
    <div class="split-list">${parts.map((part) => `<div><i style="background:${SPLIT_COLOURS[part.label]}"></i><span>${esc(part.label)}</span><b>${esc(wholeMoney(part.amount))}</b><small>${share(part.amount)}</small></div>`).join('')}</div>
    <p class="muted split-help">Includes projects still in progress, so this can change.</p>
  </div>`;
}

async function overviewPage() {
  const o = await api('/api/overview');
  const row = (label, value, strong) => `<div class="${strong ? 'strong' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  const decided = o.won + o.lost;
  const tableRows = o.months.map((m) => `<tr><td>${esc(monthLong(m.month))}</td><td class="n">${money(m.sales)}</td><td class="n">${money(m.confirmedProfit)}</td><td class="n">${money(m.expenses)}</td><td class="n">${money(m.net)}</td></tr>`).join('');
  shell('overview', `
    <div class="head"><h1>Overview</h1></div>
    <div class="kpis">
      ${kpi('Total sales', wholeMoney(o.sales), `${o.orders} ${o.orders === 1 ? 'order' : 'orders'} won, before GST`, 'blue')}
      ${kpi('Confirmed profit', wholeMoney(o.confirmedProfit), `${o.completed} completed`, o.confirmedProfit < 0 ? 'red' : 'green')}
      ${kpi('Expected profit', wholeMoney(o.expectedProfit), `${o.inProgress} in progress`, o.expectedProfit < 0 ? 'red' : 'amber')}
      ${kpi('Money to collect', wholeMoney(o.toCollect), `${wholeMoney(o.received)} received of ${wholeMoney(o.billed)}`, 'red')}
    </div>
    <div class="charts">
      ${trendCard(o.months)}
      ${splitCard(o)}
    </div>
    ${fold('More numbers', `    <div class="grid3-cards">
      <div class="card"><h2>Profit</h2><div class="totals plain">
        ${row(`Confirmed (${o.completed} completed)`, money(o.confirmedProfit))}
        ${row('Shop expenses', money(-o.expenses))}
        ${row('After shop expenses', money(o.afterExpenses), true)}
        ${row(`Expected (${o.inProgress} in progress)`, money(o.expectedProfit))}
      </div></div>
      <div class="card"><h2>Money</h2><div class="totals plain">
        ${row('Billed with GST', money(o.billed))}
        ${row('Received', money(o.received))}
        ${row('Still to collect', money(o.toCollect), true)}
        ${row('Costs still to pay', money(o.vendorDue))}
      </div></div>
      <div class="card"><h2>Investment</h2><div class="totals plain">
        ${row('Total invested', money(o.investment))}
        ${row('Earned back so far', `${o.recoveredPercent}%`, true)}
      </div>
      <div class="progress" role="img" aria-label="${o.recoveredPercent}% of the investment earned back"><span style="width:${Math.min(o.recoveredPercent, 100)}%"></span></div></div>
      <div class="card"><h2>Quotations</h2><div class="totals plain">
        ${row('Won', String(o.won))}
        ${row('Lost', String(o.lost))}
        ${row('Waiting', String(o.waiting))}
        ${row('Win rate', decided ? `${Math.round((o.won / decided) * 100)}%` : 'No results yet', true)}
      </div></div>
    </div>
    <details class="card table-view"><summary>See monthly numbers as a table</summary>
      <div class="scroll"><table><tr><th>Month</th><th class="n">Sales</th><th class="n">Confirmed profit</th><th class="n">Expenses</th><th class="n">After expenses</th></tr>${tableRows}</table></div>
    </details>
    <p class="muted">Sales and profit leave out GST. Sales count in the month the order was accepted. Confirmed profit counts when a project is completed. Expected profit can change as project costs arrive. This is a guide for running the shop, not an accounting statement.</p>`)}`);
  wireTrend(o.months);
}

// ----- Quotation report -----
const monthStart = () => `${today().slice(0, 7)}-01`;
const report = { from: null, to: null, status: 'all', range: 'month' };
const REPORT_RANGES = [['month', 'This month'], ['last', 'Last month'], ['three', 'Last 3 months'], ['year', 'This financial year'], ['custom', 'Pick dates']];

function datesFor(range) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = (y, m, d) => new Date(y, m, d).toLocaleDateString('en-CA');
  if (range === 'last') return { from: day(year, month - 1, 1), to: day(year, month, 0) };
  if (range === 'three') return { from: day(year, month - 2, 1), to: today() };
  if (range === 'year') return { from: day(month >= 3 ? year : year - 1, 3, 1), to: today() };
  return { from: monthStart(), to: today() };
}

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
    </div>
    ${chips('reportRange', 'Date range', REPORT_RANGES, report.range)}
    ${report.range === 'custom' ? `<form class="range" id="range">
      <label>From<input type="date" name="from" value="${esc(report.from)}" required></label>
      <label>To<input type="date" name="to" value="${esc(report.to)}" required></label>
      <button class="btn">Show</button>
    </form>` : ''}
    <div id="msg"></div>
    <div class="stats">
      ${stat('Win rate', q.winRate === null ? 'No results yet' : `${q.winRate}%`, true)}
      ${stat('Quotations sent', q.sent)}
      ${stat('Won', q.won)}
      ${stat('Lost', q.lost)}
    </div>
    ${fold('Value and lost reasons', `    <div class="card">
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
    </div>`)}
    ${q.followUps.length ? `<div class="card scroll">
      <h2>Follow-ups</h2>
      <table class="ledger"><tr><th>Call on</th><th>Bill</th><th>Customer</th><th>Phone</th><th class="n">Value</th></tr>${followRows}</table>
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
  wireChips('reportRange', (range) => {
    report.range = range;
    if (range !== 'custom') Object.assign(report, datesFor(range));
    quotationsPage();
  });
  const customRange = document.getElementById('range');
  if (customRange) {
    customRange.onsubmit = (event) => {
      event.preventDefault();
      Object.assign(report, Object.fromEntries(new FormData(event.target)));
      quotationsPage();
    };
  }
  document.getElementById('status').onchange = (event) => { report.status = event.target.value; quotationsPage(); };
  root.querySelectorAll('tr.link').forEach((row) => {
    row.onclick = (event) => { if (!event.target.closest('a')) location.hash = `#/bill/${row.dataset.id}`; };
  });
}

// ----- Shared pieces for money pages -----
const today = () => new Date().toLocaleDateString('en-CA');
const shortDate = (date) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');
const methodBadge = (method) => `<span class="badge ${method === 'cash' ? 'cash' : 'online'}">${method === 'cash' ? 'Cash' : 'Online'}</span>`;
const methodChoice = `<fieldset class="choices pair"><legend>Paid by</legend><div class="pair-row">
  <label><input type="radio" name="method" value="cash" checked><span>Cash</span></label>
  <label><input type="radio" name="method" value="online"><span>Online</span></label>
</div></fieldset>`;
const removeButton = (kind, id) => (me.role === 'admin' ? `<button class="btn small danger" data-delete="${kind}" data-id="${id}" aria-label="Delete entry">×</button>` : '');
const stat = (label, value, hot) => `<div class="stat ${hot ? 'hot' : ''}"><small>${esc(label)}</small><b>${esc(value)}</b></div>`;

// Connects add and delete buttons on a money page.
function wireMoneyPage(redraw) {
  root.querySelectorAll('[data-quick]').forEach((button) => {
    button.onclick = () => openQuickAdd({ kind: button.dataset.quick, projectId: button.dataset.project, costId: button.dataset.cost, fixed: true });
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
const projectBadge = (status) => `<span class="badge ${status === 'completed' ? 'q-won' : 'q-waiting'}">${status === 'completed' ? 'Completed' : 'In progress'}</span>`;
const profitLabel = (status) => (status === 'completed' ? 'Confirmed profit' : 'Expected profit');

const PROJECT_FILTERS = [['all', 'All'], ['running', 'In progress'], ['collect', 'Money to collect'], ['pay', 'Costs to pay'], ['completed', 'Completed']];
const PROJECT_TESTS = {
  all: () => true,
  running: (project) => project.status !== 'completed',
  collect: (project) => project.balance > 0,
  pay: (project) => project.vendorDue > 0,
  completed: (project) => project.status === 'completed',
};
const projectList = { filter: 'all', view: 'board' };
const BOARD_MIN_WIDTH = 1240;
const BOARD_ROWS = 5;

// Each column answers one question. A project can sit in two columns, like in progress and money to collect.
const BOARD_COLUMNS = [
  { filter: 'running', title: 'In progress', tone: 'blue', total: 'orderValue', note: (p) => `${profitLabel(p.status)} ${wholeMoney(p.profit)}` },
  { filter: 'collect', title: 'Money to collect', tone: 'red', total: 'balance', note: (p) => `${wholeMoney(p.received)} received` },
  { filter: 'pay', title: 'Costs to pay', tone: 'amber', total: 'vendorDue', note: (p) => `${wholeMoney(p.vendorCost)} total costs` },
  { filter: 'completed', title: 'Completed', tone: 'green', total: 'profit', note: (p) => `Finished ${shortDate(p.completedOn)}` },
];

function projectBoard(projects) {
  return `<div class="board">${BOARD_COLUMNS.map(({ filter, title, tone, total, note }) => {
    const list = projects.filter(PROJECT_TESTS[filter]);
    const sum = list.reduce((amount, project) => amount + project[total], 0);
    return `<section class="card board-column ${tone}">
      <div class="board-head"><h2>${esc(title)}</h2><span class="board-count">${list.length}</span><b>${esc(wholeMoney(sum))}</b></div>
      ${list.slice(0, BOARD_ROWS).map((p) => `<a class="board-row" href="#/project/${p.id}">
        <span><b>${esc(p.customerName)}</b><small>${esc(p.number)} · ${esc(note(p))}</small></span>
        <em>${esc(wholeMoney(p[total]))}</em>
      </a>`).join('') || '<p class="muted board-empty">Nothing here.</p>'}
      ${list.length > BOARD_ROWS ? `<button type="button" class="board-more" data-board-all="${filter}">View all ${list.length} →</button>` : ''}
    </section>`;
  }).join('')}</div>`;
}

async function projectsPage() {
  const projects = await api('/api/projects');
  const shown = projects.filter(PROJECT_TESTS[projectList.filter]);
  const roomForBoard = window.innerWidth >= BOARD_MIN_WIDTH && projects.length > 0;
  const showBoard = roomForBoard && projectList.view === 'board';
  const total = (key, list = projects) => list.reduce((sum, project) => sum + project[key], 0);
  const finished = projects.filter((project) => project.status === 'completed');
  const rows = shown.map((p) => `
    <tr class="link" data-id="${p.id}">
      <td>${esc(p.number)}</td><td>${esc(p.customerName)}</td><td>${projectBadge(p.status)}</td><td>${shortDate(p.acceptedOn)}</td>
      <td class="n">${money(p.grandTotal)}</td><td class="n">${money(p.received)}</td><td class="n">${money(p.balance)}</td>
      <td class="n">${money(p.vendorCost)}</td><td class="n ${p.profit < 0 ? 'loss' : 'gain'}">${money(p.profit)}</td>
    </tr>`).join('');
  shell('projects', `
    <div class="head"><h1>Projects</h1>${roomForBoard ? chips('projectView', 'Project layout', [['board', 'Board'], ['list', 'List']], projectList.view) : ''}</div>
    <div class="stats">
      ${stat('Still to collect', wholeMoney(total('balance')), true)}
      ${stat('Costs still to pay', wholeMoney(total('vendorDue')))}
      ${stat('Confirmed profit', wholeMoney(total('profit', finished)))}
      ${stat('In progress', String(projects.length - finished.length))}
    </div>
    ${showBoard ? projectBoard(projects) : `${chips('projectFilter', 'Show projects', PROJECT_FILTERS, projectList.filter)}
    <div class="card scroll">
      ${shown.length ? `<table class="compact"><tr><th>Bill</th><th>Customer</th><th>Status</th><th>Order accepted</th><th class="n">Bill total</th><th class="n">Received</th><th class="n">Balance</th><th class="n">Costs</th><th class="n">Profit</th></tr>${rows}</table>`
    : `<p class="muted">${projects.length ? 'No projects match this filter.' : 'Quotations appear here as projects once they are marked as won.'}</p>`}
    </div>`}`);
  if (roomForBoard) wireChips('projectView', (view) => { projectList.view = view; projectsPage(); });
  if (!showBoard) wireChips('projectFilter', (filter) => { projectList.filter = filter; projectsPage(); });
  root.querySelectorAll('[data-board-all]').forEach((button) => {
    button.onclick = () => {
      Object.assign(projectList, { view: 'list', filter: button.dataset.boardAll });
      projectsPage();
    };
  });
  root.querySelectorAll('tr.link').forEach((row) => { row.onclick = () => { location.hash = `#/project/${row.dataset.id}`; }; });
}

// Remembers the open tab, so saving a payment does not jump back to Summary.
const PROJECT_TABS = [['summary', 'Summary'], ['customer', 'Customer payments'], ['costs', 'Costs']];
const projectView = { id: null, tab: 'summary' };

async function projectPage(id) {
  const p = await api(`/api/projects/${id}`);
  if (projectView.id !== id) Object.assign(projectView, { id, tab: 'summary' });
  const panel = (name) => `data-panel="${name}" ${projectView.tab === name ? '' : 'hidden'}`;
  const finished = p.status === 'completed';
  const paymentRows = p.payments.map((x) => `
    <tr><td>${shortDate(x.date)}</td><td>${methodBadge(x.method)}</td><td>${esc(x.reference)}</td><td>${esc(x.note)}</td><td>${esc(x.created_by_name)}</td><td class="n">${money(x.amount)}</td><td>${removeButton('payments', x.id)}</td></tr>`).join('');
  const unpaid = p.vendorBills.filter((x) => x.due > 0);
  const costRows = p.vendorBills.map((x) => `
    <div class="cost">
      <div class="cost-main"><span class="badge type">${esc(x.category)}</span><b>${esc(x.vendor)}</b>${x.description ? `<span class="muted">${esc(x.description)}</span>` : ''}</div>
      <div class="cost-sums">
        <span><small>Total</small>${money(x.amount)}</span>
        <span><small>Paid</small>${money(x.paid)}</span>
        <span><small>Balance</small><b>${money(x.due)}</b></span>
      </div>
      <div class="cost-actions">${x.due > 0 ? `<button type="button" class="btn small" data-quick="pay" data-project="${p.id}" data-cost="${x.id}">Pay</button>` : '<span class="badge approved">Paid</span>'}${x.paid === 0 ? removeButton('vendor-bills', x.id) : ''}</div>
    </div>`).join('');
  const vendorRows = p.vendorPayments.map((x) => `
    <tr><td>${shortDate(x.date)}</td><td>${esc(x.vendor)}</td><td>${esc(x.description)}</td><td>${methodBadge(x.method)}</td><td>${esc(x.created_by_name)}</td><td class="n">${money(x.amount)}</td><td>${removeButton('vendor-payments', x.id)}</td></tr>`).join('');
  shell('projects', `
    <div class="head">
      <div><h1>${esc(p.number)}</h1><p class="muted" style="margin:4px 0 0">${esc(p.customerName)}</p></div>
      <div class="head-actions">${projectBadge(p.status)}<a class="btn" href="#/bill/${p.id}">View Bill</a></div>
    </div>
    <div id="msg"></div>
    <div class="stats">
      ${stat('Balance to collect', wholeMoney(p.balance), true)}
      ${stat('Received', wholeMoney(p.received))}
      ${stat('Project costs', wholeMoney(p.vendorCost))}
      ${stat(profitLabel(p.status), wholeMoney(p.profit))}
    </div>
    <nav class="tabs" aria-label="Project sections">
      ${PROJECT_TABS.map(([name, label]) => `<button type="button" data-tab="${name}" ${projectView.tab === name ? 'aria-current="true"' : ''}>${label}</button>`).join('')}
    </nav>
    <section ${panel('summary')}>
    ${finished ? '' : `<p class="alert warn">Profit is an estimate until this project is completed. Add all costs first.</p>`}
    <div class="card">
      <div class="split">
        <div class="totals plain">
          <div><span>Order value before GST</span><span>${money(p.orderValue)}</span></div>
          <div><span>GST</span><span>${money(p.gst)}</span></div>
          <div class="strong"><span>Bill total</span><span>${money(p.grandTotal)}</span></div>
          <div><span>Received in cash</span><span>${money(p.cash)}</span></div>
          <div><span>Received online</span><span>${money(p.online)}</span></div>
        </div>
        <div class="totals plain">
          ${p.costsByType.map((x) => `<div><span>${esc(x.type)}</span><span>${money(x.amount)}</span></div>`).join('')}
          <div class="strong"><span>Total costs</span><span>${money(p.vendorCost)}</span></div>
          <div><span>Costs paid</span><span>${money(p.vendorPaid)}</span></div>
          <div><span>Costs still to pay</span><span>${money(p.vendorDue)}</span></div>
          <div class="strong"><span>${profitLabel(p.status)}</span><span>${money(p.profit)}</span></div>
        </div>
      </div>
    </div>
    <div class="card dates">
      <form class="order" id="order">
        <label>Order accepted on<input type="date" name="acceptedOn" value="${esc(p.acceptedOn || '')}"></label>
        <button class="btn">Save Date</button>
      </form>
      ${finished
    ? `<div class="order"><p class="muted" style="margin:0">Completed on ${shortDate(p.completedOn)}.</p><button class="btn" id="reopenProject">Reopen Project</button></div>`
    : `<form class="order" id="complete">
        <label>Project finished on<input type="date" name="completedOn" value="${today()}" required></label>
        <button class="btn go">Mark as Completed</button>
      </form>`}
    </div>
    </section>
    <section ${panel('customer')}>
    <div class="card">
      <div class="card-head"><h2>Customer payments</h2>${p.balance > 0 ? `<button type="button" class="btn main" data-quick="payment" data-project="${p.id}">+ Add Payment</button>` : ''}</div>
      ${p.payments.length ? `<div class="scroll"><table class="ledger by-method"><tr><th>Date</th><th>Paid by</th><th>Reference</th><th>Note</th><th>Added by</th><th class="n">Amount</th><th></th></tr>${paymentRows}</table></div>` : '<p class="muted">No payments yet.</p>'}
      ${p.balance > 0 ? '' : '<p class="alert good">This bill is fully paid.</p>'}
    </div>
    </section>
    <section ${panel('costs')}>
    <div class="card">
      <div class="card-head"><h2>Project costs</h2><div class="card-actions">${finished ? '' : `<button type="button" class="btn main" data-quick="cost" data-project="${p.id}">+ Add Cost</button>`}${unpaid.length ? `<button type="button" class="btn" data-quick="pay" data-project="${p.id}">+ Pay a Cost</button>` : ''}</div></div>
      ${p.vendorBills.length ? costRows : '<p class="muted">No costs yet.</p>'}
      ${p.vendorBills.length ? `<div class="cost-total"><span>Total ${money(p.vendorCost)}</span><span>Paid ${money(p.vendorPaid)}</span><b>Still to pay ${money(p.vendorDue)}</b></div>` : ''}
      ${finished ? '<p class="muted" style="margin:10px 0 0">Reopen this project to add a late cost.</p>' : ''}
    </div>
    <div class="card">
      <h2>Payments made</h2>
      ${p.vendorPayments.length ? `<div class="scroll"><table class="ledger"><tr><th>Date</th><th>Paid to</th><th>For</th><th>Paid by</th><th>Added by</th><th class="n">Amount</th><th></th></tr>${vendorRows}</table></div>` : '<p class="muted">No payments made yet.</p>'}
    </div>
    </section>`);
  root.querySelectorAll('[data-tab]').forEach((button) => {
    button.onclick = () => {
      projectView.tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((tab) => {
        if (tab === button) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
      });
      root.querySelectorAll('[data-panel]').forEach((section) => { section.hidden = section.dataset.panel !== projectView.tab; });
    };
  });
  document.getElementById('order').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(`/api/projects/${id}/order`, 'PUT', Object.fromEntries(new FormData(event.target)));
      showAlert('msg', 'Order date saved', 'good');
    } catch (error) {
      showAlert('msg', error.message);
      window.scrollTo(0, 0);
    }
  };
  const setStatus = async (body, message) => {
    try {
      await api(`/api/projects/${id}/status`, 'PUT', body);
      await projectPage(id);
      showToast(message);
    } catch (error) {
      showAlert('msg', error.message);
      window.scrollTo(0, 0);
    }
  };
  const complete = document.getElementById('complete');
  if (complete) {
    complete.onsubmit = async (event) => {
      event.preventDefault();
      const noCosts = p.vendorBills.length === 0;
      const sure = await openDialog({
        title: 'Mark this project as completed?',
        message: noCosts
          ? `No costs are recorded, so the full ${money(p.orderValue)} would count as confirmed profit. Add any glass, installation or transport costs first.`
          : `Confirmed profit will be ${money(p.profit)}. You can still record payments, and reopen it for a late cost.`,
        confirmLabel: 'Mark as Completed',
      });
      if (sure) setStatus({ status: 'completed', completedOn: new FormData(complete).get('completedOn') }, 'Project completed');
    };
  }
  const reopenProject = document.getElementById('reopenProject');
  if (reopenProject) {
    reopenProject.onclick = async () => {
      const sure = await openDialog({
        title: 'Reopen this project?',
        message: 'Its profit moves back to expected until you complete it again.',
        confirmLabel: 'Reopen Project',
      });
      if (sure) setStatus({ status: 'in_progress' }, 'Project reopened');
    };
  }
  wireMoneyPage(() => projectPage(id));
}

// ----- Monthly accounts -----
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Transport', 'Tools', 'Marketing'];
const OTHER_CATEGORY = '__other__';
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
      ${stat('Left over this month', wholeMoney(a.leftOver), true)}
      ${stat('Money in', wholeMoney(a.moneyIn))}
      ${stat('Project costs paid', wholeMoney(a.vendorPaid))}
      ${stat('Shop expenses', wholeMoney(a.expensesTotal))}
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
      <div class="card-head"><h2>Shop expenses</h2><button type="button" class="btn main" data-quick="expense">+ Add Expense</button></div>
      ${a.expenses.length ? `<div class="scroll"><table class="ledger"><tr><th>Date</th><th>Category</th><th>Details</th><th>Paid by</th><th>Added by</th><th class="n">Amount</th><th></th></tr>${rows}</table></div>` : ''}
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
      ${stat('Total invested', wholeMoney(data.total), true)}
      ${data.byPerson.slice(0, 3).map((p) => stat(p.person, money(p.amount))).join('')}
    </div>
    <div class="card">
      <h2>Paid for</h2>
      <div class="totals plain wide">
        ${data.byPurpose.map((p) => `<div><span>${esc(p.paidFor)}</span><span>${money(p.amount)}</span></div>`).join('') || '<p class="muted">Nothing added yet.</p>'}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Investment entries</h2><button type="button" class="btn main" data-quick="investment">+ Add Investment</button></div>
      ${data.entries.length ? `<div class="scroll"><table class="ledger"><tr><th>Date</th><th>Who paid</th><th>Paid for</th><th>Paid by</th><th>Note</th><th class="n">Amount</th><th></th></tr>${rows}</table></div>` : ''}
    </div>`);
  wireMoneyPage(investmentPage);
}

// ----- Quick add -----
// Records everyday money from any page, using the same saves as the full pages.
const QUICK_SAVE = { payment: 'Add Payment', cost: 'Add Cost', pay: 'Pay a Cost', expense: 'Add Expense', investment: 'Add Investment' };
const QUICK_TYPES = [['payment', 'Customer payment'], ['cost', 'Project cost'], ['pay', 'Pay a cost'], ['expense', 'Shop expense'], ['investment', 'Investment'], ['bill', 'New bill']];

async function openQuickAdd({ kind: firstKind = 'payment', projectId = '', costId = '', fixed = false } = {}) {
  if (document.querySelector('.quick')) return;
  let projects;
  let people;
  try {
    [projects, { people }] = await Promise.all([api('/api/projects'), api('/api/investments')]);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const chosenProject = projects.find((p) => String(p.id) === String(projectId));
  const returnFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay quick-overlay';
  overlay.innerHTML = `<div class="dialog quick" role="dialog" aria-modal="true" aria-labelledby="quickTitle">
    <div class="quick-head"><div><h2 id="quickTitle">${fixed ? QUICK_SAVE[firstKind] : 'Quick add'}</h2>${chosenProject ? `<p class="muted">${esc(chosenProject.customerName)}, ${esc(chosenProject.number)}</p>` : ''}</div><button type="button" class="quick-close" aria-label="Close">×</button></div>
    ${fixed ? '' : chips('quickType', 'What to add', QUICK_TYPES, firstKind)}
    <form id="quickForm" novalidate></form>
  </div>`;
  document.body.append(overlay);
  const form = overlay.querySelector('#quickForm');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    returnFocus?.focus?.();
  };
  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll('button:not(:disabled), input:not([type=radio]):not(:disabled), input[type=radio]:checked, select')].filter((item) => item.offsetParent);
    const edge = event.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  }
  document.addEventListener('keydown', onKey);
  overlay.onclick = (event) => { if (event.target === overlay) close(); };
  overlay.querySelector('.quick-close').onclick = close;

  const projectField = (list, note) => `<label class="wide">Project<select name="project" data-need="project"><option value="">Select project...</option>${list.map((p) => `<option value="${p.id}">${esc(p.customerName)}, ${esc(p.number)}${note ? ` (${esc(note(p))})` : ''}</option>`).join('')}</select></label>`;
  const dateField = `<label>Date<input type="date" name="date" value="${today()}" data-need="date"></label>`;
  const amountField = (label, full) => `<label><span class="label-row">${label}${full ? '<button type="button" class="link" id="quickFull" hidden>Full balance</button>' : ''}</span><input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" data-need="amount"></label>`;
  const typeField = `<fieldset class="choices wide"><legend>Type</legend>${(projects[0]?.costTypes || []).map((type, index) => `<label><input type="radio" name="category" value="${esc(type)}" ${index ? '' : 'checked'}><span>${esc(type)}</span></label>`).join('')}</fieldset>`;
  const LISTS = {
    payment: projects.filter((p) => p.balance > 0),
    cost: projects.filter((p) => p.status !== 'completed'),
    pay: projects.filter((p) => p.vendorDue > 0),
  };
  const EMPTY = { payment: 'No project has money left to collect.', cost: 'No project is in progress.', pay: 'No project has costs left to pay.' };
  const FIELDS = {
    payment: () => `${projectField(LISTS.payment, (p) => `${wholeMoney(p.balance)} left`)}${amountField('Amount', true)}${dateField}${methodChoice}<label>UPI or bank reference<input name="reference" maxlength="80"></label>`,
    cost: () => `${projectField(LISTS.cost)}${typeField}<label class="wide">Paid to<input name="vendor" maxlength="120" data-need="paid to"></label>${amountField('Total amount')}<label>Paid now (optional)<input type="number" name="paidNow" min="0" step="0.01" inputmode="decimal"></label>${dateField}${methodChoice}`,
    pay: () => `${projectField(LISTS.pay, (p) => `${wholeMoney(p.vendorDue)} left`)}<label class="wide">Cost<select name="vendorBillId" data-need="cost" disabled><option value="">Select project first</option></select></label>${amountField('Amount', true)}${dateField}${methodChoice}`,
    expense: () => `<label class="wide">Category<select name="category" data-need="category"><option value="">Select category...</option>${EXPENSE_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}<option value="${OTHER_CATEGORY}">Other (type your own)</option></select></label>
      <label class="wide" id="quickOther" hidden>Your category<input name="otherCategory" maxlength="60" disabled data-need="your category"></label>
      <label class="wide">Details<input name="description" maxlength="200"></label>${amountField('Amount')}${dateField}${methodChoice}`,
    investment: () => `<label>Who paid<select name="person">${people.map((name) => `<option>${esc(name)}</option>`).join('')}</select></label>${amountField('Amount')}<label class="wide">Paid for<input name="paidFor" maxlength="200" data-need="paid for"></label>${dateField}${methodChoice}`,
  };

  const drawForm = async (kind) => {
    if (LISTS[kind] && !LISTS[kind].length) {
      form.innerHTML = `<p class="muted quick-empty">${EMPTY[kind]}</p>`;
      return;
    }
    form.innerHTML = `<div class="quick-fields">${FIELDS[kind]()}</div>
      <p class="dialog-error" id="quickError" role="alert"></p>
      <p class="muted quick-need" id="quickNeed"></p>
      <div class="dialog-actions quick-foot"><button type="button" class="btn" id="quickCancel">Cancel</button><button class="btn main quick-save" disabled>${QUICK_SAVE[kind]}</button></div>`;
    form.querySelector('#quickCancel').onclick = close;
    const save = form.querySelector('.quick-save');
    const need = form.querySelector('#quickNeed');
    const amount = form.elements.amount;
    const full = form.querySelector('#quickFull');
    const check = () => {
      const missing = [...form.querySelectorAll('[data-need]')].filter((item) => !item.disabled && !item.value.trim()).map((item) => item.dataset.need);
      save.disabled = missing.length > 0;
      need.textContent = missing.length ? `Still needed: ${missing.join(', ')}` : '';
    };
    const setFull = (value) => {
      if (!full) return;
      full.hidden = !value;
      full.dataset.value = value || '';
      amount.max = value || '';
    };
    form.oninput = check;
    form.onchange = check;
    if (full) {
      full.onclick = (event) => {
        event.preventDefault();
        amount.value = full.dataset.value;
        check();
      };
    }
    const project = form.elements.project;
    if (project && chosenProject) {
      project.value = chosenProject.id;
      project.closest('label').hidden = true;
    }
    if (kind === 'payment') {
      const showBalance = () => setFull(projects.find((p) => String(p.id) === project.value)?.balance);
      project.addEventListener('change', showBalance);
      showBalance();
    }
    if (kind === 'pay') {
      const cost = form.elements.vendorBillId;
      let unpaid = [];
      cost.addEventListener('change', () => setFull(unpaid.find((x) => String(x.id) === cost.value)?.due));
      const loadCosts = async () => {
        const chosen = project.value;
        unpaid = chosen ? (await api(`/api/projects/${chosen}`)).vendorBills.filter((x) => x.due > 0) : [];
        if (chosen !== project.value) return;
        cost.disabled = !chosen;
        cost.innerHTML = chosen
          ? `${unpaid.length === 1 ? '' : '<option value="">Select cost...</option>'}${unpaid.map((x) => `<option value="${x.id}">${esc(x.category)}: ${esc(x.vendor)} (${wholeMoney(x.due)} left)</option>`).join('')}`
          : '<option value="">Select project first</option>';
        setFull(unpaid.length === 1 ? unpaid[0].due : null);
        check();
      };
      project.addEventListener('change', loadCosts);
      if (chosenProject) await loadCosts();
      if (costId) {
        cost.value = costId;
        setFull(unpaid.find((x) => String(x.id) === String(costId))?.due);
      }
    }
    if (kind === 'expense') {
      const other = form.querySelector('#quickOther');
      form.elements.category.addEventListener('change', (event) => {
        const typing = event.target.value === OTHER_CATEGORY;
        other.hidden = !typing;
        form.elements.otherCategory.disabled = !typing;
      });
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      const body = Object.fromEntries(new FormData(form));
      if (body.category === OTHER_CATEGORY) body.category = body.otherCategory;
      const urls = {
        payment: `/api/projects/${body.project}/payments`,
        cost: `/api/projects/${body.project}/vendor-bills`,
        pay: `/api/projects/${body.project}/vendor-payments`,
        expense: '/api/expenses',
        investment: '/api/investments',
      };
      save.disabled = true;
      try {
        await api(urls[kind], 'POST', body);
        close();
        showToast('Saved');
        // A half-typed bill stays as it is. Every other page shows the new entry straight away.
        if (!location.hash.startsWith('#/bill/')) route();
      } catch (error) {
        form.querySelector('#quickError').textContent = error.message;
        save.disabled = false;
      }
    };
    check();
  };
  if (!fixed) {
    wireChips('quickType', (kind) => {
      if (kind === 'bill') {
        close();
        location.hash = '#/bill/new';
        return;
      }
      drawForm(kind);
    });
  }
  await drawForm(firstKind);
  const first = fixed && [...form.querySelectorAll('input:not([type=radio]):not([type=date]), select')].find((item) => item.offsetParent && !item.value);
  (first || overlay.querySelector('.quick-close')).focus();
}

async function route() {
  if (!me) return renderLogin();
  const [page, id] = location.hash.replace(/^#\//, '').split('/');
  try {
    if (page === 'bill') await billPage(id);
    else if (page === 'bills') await billsPage();
    else if (page === 'quotations') await quotationsPage();
    else if (page === 'projects') await projectsPage();
    else if (page === 'project') await projectPage(id);
    else if (page === 'accounts') await accountsPage();
    else if (page === 'investment') await investmentPage();
    else if (page === 'enquiries') await enquiriesPage();
    else if (page === 'rates') await ratesPage();
    else if (page === 'settings') await settingsPage();
    else if (page === 'users' && me.role === 'admin') await usersPage();
    else if (page === 'activity' && me.role === 'admin') await activityPage();
    else if (page === 'account') accountPage();
    else await overviewPage();
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

function addPasswordToggles(scope = root) {
  scope.querySelectorAll('input[type=password]:not([data-eye])').forEach((input) => {
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
