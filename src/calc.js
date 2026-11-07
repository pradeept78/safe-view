// All bill arithmetic lives here so the screen, the server and the printout agree.
// Rounding follows the sample proforma: each piece's area is rounded to 4 decimal
// places first, weight uses the actual size, and money uses the chargeable size.

const SQFT_PER_SQM = 10.7639;
const KG_PER_SQM_PER_MM = 2.5; // glass weighs 2.5 kg per square metre per mm of thickness

function round(value, places) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function requirePositive(value, label, lineNumber) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Line ${lineNumber}: ${label} must be more than zero`);
  }
}

// Number('') is 0, so a blank box has to be caught before it becomes a zero price or zero tax.
function readAmount(value, message) {
  const number = value === '' || value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(message);
  return number;
}

function calculateLine(line, allowanceMm, defaultGst, lineNumber) {
  const widthMm = Number(line.widthMm);
  const heightMm = Number(line.heightMm);
  const qty = Number(line.qty);
  const thicknessMm = Number(line.thicknessMm);
  const rate = readAmount(line.rate, `Line ${lineNumber}: enter a rate that is not negative`);
  const gstPercent = readAmount(line.gstPercent ?? defaultGst, `Line ${lineNumber}: enter the GST %`);

  requirePositive(widthMm, 'width', lineNumber);
  requirePositive(heightMm, 'height', lineNumber);
  requirePositive(thicknessMm, 'glass thickness', lineNumber);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error(`Line ${lineNumber}: quantity must be a whole number`);

  const chargeWidthMm = widthMm + allowanceMm;
  const chargeHeightMm = heightMm + allowanceMm;
  const pieceArea = round((chargeWidthMm * chargeHeightMm) / 1e6, 4);
  const areaSqm = round(pieceArea * qty, 4);
  const actualPieceArea = round((widthMm * heightMm) / 1e6, 4);

  return {
    ...line,
    widthMm,
    heightMm,
    qty,
    rate,
    gstPercent,
    thicknessMm,
    chargeWidthMm,
    chargeHeightMm,
    areaSqm,
    amount: round(areaSqm * rate, 2),
    weightKg: actualPieceArea * qty * thicknessMm * KG_PER_SQM_PER_MM,
    widthIn: toInches(widthMm),
    heightIn: toInches(heightMm),
  };
}

function calculateExtra(extra, defaultGst, number) {
  const description = String(extra.description ?? '').trim();
  if (!description) throw new Error(`Additional charge ${number}: enter a description`);
  const amount = readAmount(extra.amount, `Additional charge ${number}: enter an amount that is not negative`);
  const gstPercent = readAmount(extra.gstPercent ?? defaultGst, `Additional charge ${number}: enter the GST %`);
  return { description, hsn: String(extra.hsn ?? '').trim(), amount: round(amount, 2), gstPercent };
}

// Tax is worked out once per GST rate, on the total charged at that rate.
function taxByRate(items) {
  const taxable = new Map();
  for (const item of items) taxable.set(item.gstPercent, (taxable.get(item.gstPercent) || 0) + item.amount);
  return [...taxable.entries()].sort(([a], [b]) => a - b).map(([percent, amount]) => {
    const half = round((round(amount, 2) * percent) / 200, 2);
    return { percent, taxable: round(amount, 2), cgst: half, sgst: half };
  });
}

function calculateBill({ lines, extras = [], allowanceMm = 50, gstPercent = 18 }) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('Add at least one glass line');
  const allowance = Number(allowanceMm);
  const gst = Number(gstPercent);
  if (!Number.isFinite(allowance) || allowance < 0) throw new Error('Allowance cannot be negative');
  if (!Number.isFinite(gst) || gst < 0) throw new Error('GST cannot be negative');

  const calculated = lines.map((line, index) => calculateLine(line, allowance, gst, index + 1));
  const charges = extras.map((extra, index) => calculateExtra(extra, gst, index + 1));
  const sum = (key) => calculated.reduce((total, line) => total + line[key], 0);

  const glassAmount = round(sum('amount'), 2);
  const extrasAmount = round(charges.reduce((total, extra) => total + extra.amount, 0), 2);
  const basic = round(glassAmount + extrasAmount, 2);
  const taxes = taxByRate([...calculated, ...charges]);
  const cgst = round(taxes.reduce((total, tax) => total + tax.cgst, 0), 2);
  const sgst = cgst;
  const gross = round(basic + cgst + sgst, 2);
  const grandTotal = Math.round(gross);
  const areaSqm = round(sum('areaSqm'), 4);

  return {
    lines: calculated,
    extras: charges,
    totals: {
      qty: sum('qty'),
      areaSqm,
      sqft: round(areaSqm * SQFT_PER_SQM, 4),
      weightKg: round(sum('weightKg'), 3),
      glassAmount,
      extrasAmount,
      basic,
      gstPercent: gst,
      taxes,
      cgst,
      sgst,
      gross,
      roundOff: round(grandTotal - gross, 2),
      grandTotal,
    },
  };
}

function toInches(mm) {
  const eighths = Math.round((mm / 25.4) * 8);
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  return rest === 0 ? String(whole) : `${whole} ${rest}/8`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ');
}

function amountInWords(amount) {
  let n = Math.round(amount);
  if (n === 0) return 'Zero Only';
  const parts = [];
  for (const [size, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand'], [100, 'Hundred']]) {
    const count = Math.floor(n / size);
    if (count > 0) {
      parts.push(`${size === 1e7 ? amountInWords(count).replace(' Only', '') : belowHundred(count)} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(belowHundred(n));
  return `${parts.join(' ')} Only`;
}

module.exports = { calculateBill, toInches, amountInWords };
