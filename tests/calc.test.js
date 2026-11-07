const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBill, toInches, amountInWords } = require('../src/calc');

const glass = { glassName: '5MM CLEAR TOUGHENED GLASS', hsn: '70071100', thicknessMm: 5, rate: 684.15, qty: 3 };

// The sample proforma PI/05444: every expected figure below is printed on that bill.
const sample = {
  allowanceMm: 50,
  gstPercent: 18,
  lines: [
    { ...glass, widthMm: 1200, heightMm: 970 },
    { ...glass, widthMm: 1338, heightMm: 893 },
    { ...glass, widthMm: 690, heightMm: 690 },
  ],
};

test('reproduces every line of the sample bill', () => {
  const { lines } = calculateBill(sample);
  assert.deepEqual(lines.map((l) => [l.chargeWidthMm, l.chargeHeightMm]), [[1250, 1020], [1388, 943], [740, 740]]);
  assert.deepEqual(lines.map((l) => l.areaSqm), [3.825, 3.9267, 1.6428]);
  assert.deepEqual(lines.map((l) => l.amount), [2616.87, 2686.45, 1123.92]);
});

test('reproduces the totals of the sample bill', () => {
  const t = calculateBill(sample).totals;
  assert.equal(t.qty, 9);
  assert.equal(t.areaSqm, 9.3945);
  assert.equal(t.basic, 6427.24);
  assert.equal(t.cgst, 578.45);
  assert.equal(t.sgst, 578.45);
  assert.equal(t.gross, 7584.14);
  assert.equal(t.roundOff, -0.14);
  assert.equal(t.grandTotal, 7584);
  assert.equal(t.weightKg, 106.309);
  assert.equal(t.sqft, 101.1215);
});

test('shows inches to the nearest eighth like the sample', () => {
  assert.equal(toInches(1200), '47 2/8');
  assert.equal(toInches(970), '38 2/8');
  assert.equal(toInches(1338), '52 5/8');
  assert.equal(toInches(893), '35 1/8');
  assert.equal(toInches(690), '27 1/8');
  assert.equal(toInches(25.4), '1');
});

test('writes amounts in Indian number words', () => {
  assert.equal(amountInWords(7584), 'Seven Thousand Five Hundred Eighty Four Only');
  assert.equal(amountInWords(125000), 'One Lakh Twenty Five Thousand Only');
  assert.equal(amountInWords(10000000), 'One Crore Only');
  assert.equal(amountInWords(0), 'Zero Only');
});

test('uses the allowance given on the bill', () => {
  const { lines } = calculateBill({ ...sample, allowanceMm: 0 });
  assert.equal(lines[0].chargeWidthMm, 1200);
  assert.equal(lines[0].areaSqm, 3.492);
});

test('taxes each line at its own GST rate', () => {
  const line = { ...glass, qty: 1, rate: 1000, widthMm: 950, heightMm: 950 }; // charged as 1 sq m
  const { totals } = calculateBill({
    allowanceMm: 50,
    gstPercent: 18,
    lines: [line, { ...line, gstPercent: 12 }],
  });
  assert.equal(totals.basic, 2000);
  assert.deepEqual(totals.taxes, [
    { percent: 12, taxable: 1000, cgst: 60, sgst: 60 },
    { percent: 18, taxable: 1000, cgst: 90, sgst: 90 },
  ]);
  assert.equal(totals.cgst, 150);
  assert.equal(totals.sgst, 150);
  assert.equal(totals.grandTotal, 2300);
});

test('adds extra charges to the amount and taxes them', () => {
  const { totals, extras } = calculateBill({
    ...sample,
    extras: [{ description: 'Fitting', hsn: '9954', amount: '500', gstPercent: 18 }],
  });
  assert.equal(extras[0].amount, 500);
  assert.equal(totals.glassAmount, 6427.24);
  assert.equal(totals.extrasAmount, 500);
  assert.equal(totals.basic, 6927.24);
  assert.equal(totals.cgst, 623.45);
  assert.equal(totals.grandTotal, 8174);
  assert.equal(totals.qty, 9);
});

test('a manually typed rate is used for the amount', () => {
  const { lines } = calculateBill({ ...sample, lines: [{ ...sample.lines[0], rate: 700, listRate: 684.15 }] });
  assert.equal(lines[0].amount, 2677.5);
  assert.equal(lines[0].listRate, 684.15);
});

test('blank rates, GST and incomplete extra charges are refused', () => {
  const line = sample.lines[0];
  assert.throws(() => calculateBill({ ...sample, lines: [{ ...line, rate: '' }] }), /rate/i);
  assert.throws(() => calculateBill({ ...sample, lines: [{ ...line, gstPercent: '' }] }), /gst/i);
  assert.throws(() => calculateBill({ ...sample, extras: [{ description: '', amount: 10 }] }), /description/i);
  assert.throws(() => calculateBill({ ...sample, extras: [{ description: 'Fitting', amount: '' }] }), /amount/i);
});

test('rejects sizes that cannot be billed', () => {
  const line = { ...glass, widthMm: 1000, heightMm: 1000 };
  assert.throws(() => calculateBill({ ...sample, lines: [] }), /at least one/i);
  assert.throws(() => calculateBill({ ...sample, lines: [{ ...line, widthMm: 0 }] }), /width/i);
  assert.throws(() => calculateBill({ ...sample, lines: [{ ...line, qty: 1.5 }] }), /quantity/i);
  assert.throws(() => calculateBill({ ...sample, lines: [{ ...line, rate: -1 }] }), /rate/i);
});
