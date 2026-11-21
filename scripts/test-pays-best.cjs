const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/pays-best.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require);
const { paysBest, kindOf, workDays } = m.exports;
assert.equal(kindOf('REPAIR BULKHEAD DOOR AND HINGES').kind, 'Doors / locks');
assert.equal(kindOf('SCRAPE, PLASTER AND PAINT CEILING').kind, 'Plaster / paint');
assert.equal(kindOf('REPAIR LEAK AT KITCHEN SINK').kind, 'Plumbing');
assert.equal(kindOf('INSTALL SMOKE DETECTOR NEAR DOOR').kind, 'Smoke / CO detectors');
assert.equal(kindOf('SOMETHING ELSE').kind, 'Other');
assert.equal(workDays('1/5/26', '1/5/26'), 1);
assert.equal(workDays('1/5/26', '1/7/26'), 3);
assert.equal(workDays('', '1/7/26'), 1);
assert.equal(workDays('1/9/26', '1/7/26'), 1);
const r = paysBest([
  { OMO: 'A', JobDescription: 'PAINT WALLS', AwardAmount: '1,000.00', WorkStartDate: '1/5/26', WorkCompletionDate: '1/6/26' },
  { OMO: 'B', JobDescription: 'PLASTER CEILING', AwardAmount: '600', WorkStartDate: '1/5/26', WorkCompletionDate: '1/5/26' },
  { OMO: 'C', JobDescription: 'FIX DOOR', AwardAmount: '500', WorkStartDate: '1/5/26', WorkCompletionDate: '1/9/26' },
  { OMO: 'D', JobDescription: 'FIX DOOR LOCK', AwardAmount: '300', WorkStartDate: '1/5/26', WorkCompletionDate: '1/5/26' },
  { OMO: 'E', JobDescription: 'FIX TOILET', AwardAmount: '900' }, // only one plumbing job: left out
  { OMO: 'TEST-0001', JobDescription: 'PAINT', AwardAmount: '99999' },
  { OMO: 'F', JobDescription: 'PAINT', AwardAmount: '' },
]);
assert.deepEqual(r.map((k) => [k.kind, k.jobs, k.total, k.perJob, k.perDay]), [
  ['Plaster / paint', 2, 1600, 800, 533],
  ['Doors / locks', 2, 800, 400, 133],
]);
assert.deepEqual(paysBest(null), []);
console.log('pays-best tests passed');
