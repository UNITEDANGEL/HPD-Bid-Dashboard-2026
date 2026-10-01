const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loadTs(file) {
  const context = { exports: {}, require: name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts')) : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const { invoiceChangeAmount, noWorkServiceChargeForAmount } = loadTs(path.join(root, 'lib/paperwork.ts'));

// Work completed at the bid: no change.
assert.equal(invoiceChangeAmount('$1,000.00', '$1,000.00'), 0);
// Partial: $1000 bid, $500 done.
assert.equal(invoiceChangeAmount(1000, 500), -500);
// No access under $2000: $100 service charge.
assert.equal(noWorkServiceChargeForAmount(1000), 100);
assert.equal(invoiceChangeAmount(1000, noWorkServiceChargeForAmount(1000)), -900);
// No access at $2000 or more: $300 service charge.
assert.equal(noWorkServiceChargeForAmount(1999.99), 100);
assert.equal(noWorkServiceChargeForAmount('$2,000.00'), 300);
assert.equal(invoiceChangeAmount(2000, noWorkServiceChargeForAmount(2000)), -1700);
// Cents stay exact.
assert.equal(invoiceChangeAmount('411.10', '300.05'), -111.05);

const page = fs.readFileSync(path.join(root, 'app/paperwork/page.tsx'), 'utf8');
assert.ok(page.includes('pdfMoney(invoiceChangeAmount(bidValue, chargeValue), true)'), 'Invoice Increase/Decrease must be charge minus bid for every outcome');

console.log('Invoice amounts: completed 0, partial -500, no access -900 / -1700 ($300 at $2000+).');
