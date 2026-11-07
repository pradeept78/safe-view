const { amountInWords } = require('./calc');

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });

const STYLE = `
  *{box-sizing:border-box}
  body{margin:0;background:#e9ecf1;color:#000;font:13px/1.35 Arial,Helvetica,sans-serif}
  .sheet{background:#fff;max-width:800px;margin:16px auto;padding:24px}
  .tools{max-width:800px;margin:16px auto 0;padding:0 16px;text-align:right}
  .tools button{font:600 14px Arial;padding:10px 18px;background:#1f7a4d;color:#fff;border:0;border-radius:4px;cursor:pointer}
  header{display:flex;gap:14px;align-items:center;justify-content:center;text-align:center}
  header .logo{background:#1a212c;padding:6px 10px;border-radius:4px;display:flex;align-items:center;gap:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  header img{height:46px;display:block}
  header h1{font-size:22px;margin:0 0 2px}
  header p{margin:0;font-size:12px;white-space:pre-line}
  h2{text-align:center;font-size:16px;margin:12px 0 8px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px}
  .box{border:1px solid #000;padding:7px 10px;min-height:60px;overflow-wrap:anywhere}
  .box b.big{font-size:15px}
  .glass{border:1px solid #000;border-bottom:0;padding:5px 10px;font-weight:700;display:flex;gap:24px;flex-wrap:wrap}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th,td{border:1px solid #000;padding:4px 5px;text-align:center;font-size:12px}
  td.r{text-align:right}
  .foot{display:grid;grid-template-columns:1.5fr 1fr;border:1px solid #000}
  .foot>div{padding:8px 10px}
  .foot>div:first-child{border-right:1px solid #000}
  .terms{white-space:pre-line;font-size:12px}
  .red{color:#c00;font-weight:700}
  .replaced{border:2px solid #c00;color:#c00;font-weight:700;text-align:center;padding:6px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;gap:10px}
  .grand{font-size:16px;font-weight:700;border-top:1px solid #000;margin-top:6px;padding-top:6px}
  .words{border:1px solid #000;border-top:0;padding:7px 10px;font-weight:700}
  .sign{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;border:1px solid #000;padding:8px 10px;margin-top:6px;min-height:80px;align-items:end}
  .sign b{display:block}
  .note{font-size:11px;margin-top:6px;display:flex;justify-content:space-between;gap:12px}
  .scroll{max-width:100%}
  @media (max-width:600px){
    .sheet{padding:12px;margin:8px 0;overflow:hidden}
    header{flex-direction:column;gap:8px}
    header .logo{max-width:100%}
    header img{height:auto;max-height:40px;max-width:45%}
    header img:last-child{max-width:calc(100% - 56px)}
    header div:last-child{min-width:0;max-width:100%;overflow-wrap:anywhere}
    .two,.foot{grid-template-columns:minmax(0,1fr)}
    .foot>div:first-child{border-right:0;border-bottom:1px solid #000}
    .scroll{overflow-x:auto}
    table{min-width:620px}
    table.fit{min-width:0}
    .sign{grid-template-columns:1fr 1fr;row-gap:18px}
    .note{flex-direction:column;gap:2px}
  }
  @media print{body{background:#fff}.tools{display:none}.sheet{margin:0;max-width:none;padding:0}@page{size:A4;margin:10mm}}
`;

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function renderMessage(message) {
  return page('Safe View', `<div class="sheet"><p>${esc(message)}</p><p><a href="/admin/">Back to dashboard</a></p></div>`);
}

function glassGroups(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = `${line.glassName}|${line.hsn}`;
    if (!groups.has(key)) groups.set(key, { name: line.glassName, hsn: line.hsn, lines: [] });
    groups.get(key).lines.push(line);
  }
  return [...groups.values()];
}

function renderGroup(group) {
  let serial = 0;
  const rows = group.lines.map((line) => `
    <tr><td>${++serial}</td><td>${esc(line.shape)}</td>
      <td>${esc(line.widthIn)}</td><td>${esc(line.heightIn)}</td>
      <td>${line.widthMm}</td><td>${line.heightMm}</td>
      <td>${line.chargeWidthMm}</td><td>${line.chargeHeightMm}</td>
      <td>${line.qty}</td><td class="r">${line.areaSqm.toFixed(3)}</td>
      <td class="r">${money(line.rate)}</td><td class="r">${money(line.amount)}</td></tr>`).join('');
  return `
    <div class="glass"><span>${esc(group.name)}</span><span>HSN ${esc(group.hsn)}</span></div>
    <div class="scroll"><table>
      <tr><th rowspan="2">SR</th><th rowspan="2">Shape</th><th colspan="2">Actual (in)</th><th colspan="2">Actual (mm)</th><th colspan="2">Chargeable (mm)</th><th rowspan="2">Qty</th><th rowspan="2">Area SQM</th><th rowspan="2">Rate</th><th rowspan="2">Amount</th></tr>
      <tr><th>W</th><th>H</th><th>W</th><th>H</th><th>W</th><th>H</th></tr>
      ${rows}
    </table></div>`;
}

function renderExtras(extras) {
  if (!extras.length) return '';
  const rows = extras.map((extra, index) => `
    <tr><td>${index + 1}</td><td style="text-align:left">${esc(extra.description)}</td><td>${esc(extra.hsn)}</td><td class="r">${money(extra.amount)}</td></tr>`).join('');
  return `
    <div class="glass"><span>ADDITIONAL CHARGES</span></div>
    <div class="scroll"><table class="fit"><tr><th>SR</th><th>Description</th><th>HSN/SAC</th><th>Amount</th></tr>${rows}</table></div>`;
}

function renderBill(bill, { invoice = false } = {}) {
  const b = invoice ? bill.invoiceBusiness : bill.business;
  const t = bill.totals;
  // Tax is split between the centre and state inside one state, and is IGST between states.
  const interstate = invoice && Boolean(b.gstin) && b.gstin.slice(0, 2) !== bill.invoiceStateCode;
  // Bills saved before GST moved onto each material have one rate and no list of taxes.
  const taxes = t.taxes || [{ percent: t.gstPercent, cgst: t.cgst, sgst: t.sgst }];
  const taxRows = taxes.map((tax) => (interstate ? `
          <div class="row"><span>IGST ${tax.percent}%</span><span>${money(tax.cgst + tax.sgst)}</span></div>` : `
          <div class="row"><span>C-GST ${tax.percent / 2}%</span><span>${money(tax.cgst)}</span></div>
          <div class="row"><span>S-GST ${tax.percent / 2}%</span><span>${money(tax.sgst)}</span></div>`)).join('');
  const contact = [b.gstin && `GSTIN: ${b.gstin}`, b.email && `Email: ${b.email}`, b.phone && `Ph: ${b.phone}`].filter(Boolean).join('   ');
  const bank = [['Bank', b.bank_name], ['A/c No', b.bank_account], ['IFSC', b.bank_ifsc], ['Branch', b.bank_branch]].filter(([, v]) => v);

  const heading = invoice ? 'TAX INVOICE' : 'PROFORMA INVOICE';
  const documentBox = invoice
    ? `<b class="big">Invoice No : ${esc(bill.invoiceNumber)}</b><br>Invoice Date : ${esc(bill.invoiceDate.split('-').reverse().join('/'))}<br>Proforma Ref : ${esc(bill.number)}`
    : `<b class="big">Proforma No : ${esc(bill.number)}</b><br>Date : ${date(bill.approvedAt)}${bill.revisesNumber ? `<br>Replaces : ${esc(bill.revisesNumber)}` : ''}`;
  const replaced = !invoice && bill.supersededBy
    ? `<div class="replaced">Replaced by ${esc(bill.supersededByNumber)}. This bill is no longer valid.</div>` : '';

  return page(invoice ? bill.invoiceNumber : bill.number, `
    <div class="tools"><button onclick="window.print()">Print</button></div>
    <div class="sheet">
      <header>
        <div class="logo"><img src="/img/emblem.png" alt=""><img src="/img/word.png" alt="${esc(b.business_name)}"></div>
        <div><h1>${esc(b.business_name)}</h1><p>${esc(b.address)}</p><p>${esc(contact)}</p></div>
      </header>
      <h2>${heading}</h2>
      ${replaced}
      <div class="two">
        <div class="box">${documentBox}</div>
        <div class="box">${invoice ? `Place of Supply (State Code) : ${esc(bill.invoiceStateCode)}<br>` : ''}Project Remark : ${esc(bill.projectRemark)}<br>Freight : To be billed</div>
      </div>
      <div class="two">
        <div class="box"><b>M/s. ${esc(bill.customerName)}</b><br>${esc(bill.customerAddress)}<br>State Code : ${esc(bill.customerStateCode)}<br>GST No. : ${esc(bill.customerGstin)}</div>
        <div class="box"><b>Dispatch To : ${esc(bill.customerName)}</b><br>${esc(bill.customerAddress)}<br>Ph : ${esc(bill.customerPhone)}</div>
      </div>
      ${glassGroups(bill.lines).map(renderGroup).join('')}
      ${renderExtras(bill.extras)}
      <div class="foot">
        <div>
          <div class="red">Payment Terms</div>
          <div class="terms">${esc(b.terms)}</div>
          ${bank.length ? `<div class="red" style="margin-top:8px">Bank Details</div><div>${esc(b.business_name)}</div>${bank.map(([k, v]) => `<div>${k} : ${esc(v)}</div>`).join('')}` : ''}
        </div>
        <div>
          <div class="row"><span>Total Qty</span><b>${t.qty}</b></div>
          <div class="row"><span>Basic Amount</span><b>${money(t.basic)}</b></div>
          ${taxRows}
          <div class="row"><span>Gross Total</span><b>${money(t.gross)}</b></div>
          <div class="row"><span>Round Off</span><span>${money(t.roundOff)}</span></div>
          <div class="row grand"><span>Grand Total</span><span>${money(t.grandTotal)}</span></div>
          <div class="row" style="margin-top:8px"><span>Total Area SQM</span><b>${t.areaSqm}</b></div>
          <div class="row"><span>Total Sq.Ft.</span><b>${t.sqft}</b></div>
          <div class="row"><span>Total Weight</span><b>${t.weightKg}</b></div>
        </div>
      </div>
      <div class="words">Amount in words : ${esc(amountInWords(t.grandTotal))}</div>
      <div class="sign">
        <div><b>Prepared By</b>${esc(bill.preparedBy)}</div>
        <div><b>Checked By</b>${esc(bill.checkedBy)}</div>
        <div><b>Customer's Acceptance</b>Sign &amp; Seal</div>
        <div><b>Authorised Signatory</b></div>
      </div>
      <div class="note"><span>${b.jurisdiction ? `Subject to ${esc(b.jurisdiction)} Jurisdiction` : ''}</span><span>Approved ${esc(new Date(bill.approvedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }))}</span></div>
    </div>`);
}

module.exports = { renderBill, renderMessage };
