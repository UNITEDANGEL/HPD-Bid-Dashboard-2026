const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require); return m.exports; };
const { priceHelp } = load('lib/bid-price.ts');
const fill = load('lib/bid-fill.ts');

const history = [
  { id: 'D1', description: 'REPLACE HOPPER CHUTE DOOR LATCH AT 3RD STORY', amount: 380 },
  { id: 'D2', description: 'REPAIR HOPPER CHUTE DOOR AND LATCH', amount: 400 },
  { id: 'D3', description: 'HOPPER DOOR LATCH SET REPLACE', amount: 420 },
  { id: 'D4', description: 'AEP ALTERNATIVE ENFORCEMENT PROGRAM WATER LEAK CEILING PLASTER PAINT', amount: 1800 },
  { id: 'D5', description: 'AEP ALTERNATIVE ENFORCEMENT PROGRAM BULKHEAD DOOR CLOSER', amount: 500 },
  { id: 'D6', description: 'TRACE WATER LEAK REPAIR CEILING PLASTER AND PAINT BATHROOM', amount: 2200 },
  { id: 'D0', description: 'HOPPER LATCH', amount: 0 },
];
// Hopper latch work matches the hopper jobs; the $0 one is ignored.
const hopper = priceHelp('REPLACE 3RD STY HOPPER LATCH SET AT PUBLIC HALL HOPPER CHUTE DOOR', history);
assert.deepEqual(hopper.examples.map((e) => e.id).sort(), ['D1', 'D2', 'D3']);
assert.equal(hopper.middle, 400);
assert.ok(hopper.low <= hopper.middle && hopper.middle <= hopper.high);
// "AEP" is a program label, not the kind of work: a leak job matches leak jobs, not the AEP door job.
const leak = priceHelp('AEP AT APT 2J REPAIR WATER LEAKS AND DAMAGED CEILING PLASTER', history);
assert.deepEqual(leak.examples.map((e) => e.id).sort(), ['D4', 'D6']);
assert.equal(priceHelp('', history), null);
assert.equal(priceHelp('ROOF DRAIN', history), null, 'nothing similar: no made-up range');

// Bid package text helpers.
assert.equal(fill.bidPriceText(1250), '1,250.00');
assert.equal(fill.bidDateText('2026-10-07'), '10/7/26');
assert.equal(fill.bidDescription('NYC HPD EMERGENCY OPERATIONS DIVISION – “ESSENTIAL SERVICE WORK“ AT DOOR: INSTALL CLOSER. CONTRACTOR MUST CONTACT HPD @ 212'), 'AT DOOR: INSTALL CLOSER. REMOVE ALL WORK RELATED DEBRIS.');
console.log('PASS bid price help: similar work by trade words (not program labels), range and middle, no made-up ranges; bid package text');
