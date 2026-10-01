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
const { noAccessAttemptProblem, dateInputValue, noTelephoneNote } = loadTs(path.join(root, 'lib/no-access.ts'));

// Form stores MM/DD/YY; date inputs give YYYY-MM-DD.
assert.equal(dateInputValue('10/01/26'), '2026-10-01');
assert.equal(dateInputValue('2026-10-01'), '2026-10-01');
assert.equal(dateInputValue(''), '');

// 72 hours = at least 3 calendar days apart.
assert.equal(noAccessAttemptProblem('10/01/26', '10/04/26'), '');
assert.equal(noAccessAttemptProblem('2026-10-01', '10/10/26'), '');
assert.match(noAccessAttemptProblem('10/01/26', '10/03/26'), /72 hours apart.*2 days apart.*10\/04\/26/);
assert.match(noAccessAttemptProblem('10/01/26', '10/01/26'), /0 days apart/);
assert.match(noAccessAttemptProblem('10/05/26', '10/01/26'), /before the 1st/);
assert.match(noAccessAttemptProblem('', '10/04/26'), /1st access attempt/);
assert.match(noAccessAttemptProblem('10/01/26', ''), /2nd access attempt/);
// Daylight saving ends 11/01/26: still exactly 3 days.
assert.equal(noAccessAttemptProblem('10/31/26', '11/03/26'), '');

assert.equal(noTelephoneNote(true), 'NO TELEPHONE NUMBER AVAILABLE - PUBLIC HALLWAY');
assert.equal(noTelephoneNote(true, 'Public Area (Exterior)'), 'NO TELEPHONE NUMBER AVAILABLE - PUBLIC AREA (EXTERIOR)');
assert.equal(noTelephoneNote(false), 'NO TELEPHONE NUMBER AVAILABLE');

const page = fs.readFileSync(path.join(root, 'app/paperwork/page.tsx'), 'utf8');
assert.ok(page.includes('noAccessDetailsProblem(activeForm)'), 'No Access generation must check attempt gap and call dates');
assert.ok(page.includes('upper(activeForm.partialReason)'), 'Partial reason must come from its own field, not the job scope');

console.log('No Access rules: 72-hour attempt gap, call dates and no-phone note checked.');
