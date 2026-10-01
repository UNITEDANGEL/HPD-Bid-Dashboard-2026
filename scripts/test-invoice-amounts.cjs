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

const { invoiceMaterials, doorCount, materialsFromText, materialsToText } = loadTs(path.join(root, 'lib/invoice-materials.ts'));
const names = scope => JSON.parse(JSON.stringify(invoiceMaterials(scope).map(m => `${m.qty} ${m.name}`)));
const basics = ['1 TRASH BAGS', '1 WD-40', '1 DISPOSABLE RAGS', '1 SCREWS'];
// Basics on every work package.
assert.deepEqual(names('MAKE ALL NECESSARY REPAIR TO THE DOOR TO RE-ALIGN WITH FRAME'), [...basics, '1 ADJUST AND ALIGN DOOR']);
// Hinges: 3 per door.
assert.ok(names('INSTALL HINGES TO ENTRANCE DOOR. ENSURE DOOR IS SELF CLOSING. TOTAL NOS OF DOOR= (1)').includes('3 SELF CLOSING HINGES'));
assert.equal(doorCount('TOTAL DOORS = 2 (TWO)'), 2);
assert.ok(names('REPLACE HINGES AND DOOR CLOSER. TOTAL DOORS = 2').includes('6 SELF CLOSING HINGES'));
assert.ok(names('REPLACE HINGES AND DOOR CLOSER. TOTAL DOORS = 2').includes('2 DOOR CLOSER'));
// Adam Rite lock with push paddle keeps both.
const adam = names('INSTALL NEW ADAM RITE LOCK WITH PUSH PADDLE USING SAME KEY CYLINDER');
assert.ok(adam.includes('1 ADAM RITE LOCK') && adam.includes('1 PUSH PADDLE / PANIC BAR') && adam.includes('1 LOCK CYLINDER') && !adam.includes('1 LOCKSET'));
// Stated counts.
assert.ok(names('REPLACE 2NOS FIRE ESCAPE WINDOW LOWER SASH SPRING BALANCE').includes('2 SPRING BALANCE'));
// Leak / plaster jobs.
const leak = names('REPAIR THE LEAK AND RESTORE BROKEN PLASTER. PROVIDE SHEETROCK RESTORATION AND PAINT');
for (const item of ['1 PLASTER / JOINT COMPOUND', '1 SHEETROCK', '1 PAINT', '1 PLUMBING FITTINGS / TEFLON TAPE']) assert.ok(leak.includes(item), item);
// Never more than the 12 invoice rows.
assert.ok(invoiceMaterials('HINGE CLOSER MORTISE CYLINDER STRIKE SADDLE DOOR SWEEP SASH GLASS PLASTER SHEETROCK PAINT TILE LEAK CAULK DOOR').length <= 12);
// Edited list round-trips.
assert.deepEqual(JSON.parse(JSON.stringify(materialsFromText('3 self closing hinges\n1 WD-40\nRAGS'))), [{ qty: '3', name: 'SELF CLOSING HINGES' }, { qty: '1', name: 'WD-40' }, { qty: '', name: 'RAGS' }]);
assert.equal(materialsToText([{ qty: '3', name: 'SELF CLOSING HINGES' }]), '3 SELF CLOSING HINGES');

const page = fs.readFileSync(path.join(root, 'app/paperwork/page.tsx'), 'utf8');
assert.ok(page.includes('pdfMoney(invoiceChangeAmount(bidValue, chargeValue), true)'), 'Invoice Increase/Decrease must be charge minus bid for every outcome');

assert.ok(page.includes('partialInvoiceDescription(activeForm)'), 'Partial invoice description must be the work actually completed');
console.log('Invoice materials from scope checked. Invoice amounts: completed 0, partial -500, no access -900 / -1700 ($300 at $2000+).');
