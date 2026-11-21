const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (f) => { const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, (p) => p === './job-priority' ? load('lib/job-priority.ts') : require(p)); return m.exports; };
const { awardCountdown, daysLeftText } = load('lib/award-countdown.ts');
const r = awardCountdown({
  today: '2026-11-21',
  awards: [
    { OMO: 'ER09417', AwardDate: '11/05/26', WorkCompletionDate: '11/25/26' },
    { OMO: 'ER07567', AwardDate: '10/10/26', WorkCompletionDate: '10/20/26' },
    { OMO: 'ER09579', AwardDate: '11/05/26', WorkCompletionDate: '11/20/26' },
    { OMO: 'ER09579', AwardDate: '11/05/26', WorkCompletionDate: '11/20/26' }, // duplicate row
    { OMO: 'ER01000', AwardDate: '11/01/26', WorkCompletionDate: '11/30/26' }, // paperwork sent
    { OMO: 'ER02000', AwardDate: '11/01/26', WorkCompletionDate: '11/30/26' }, // HPD closed it
    { OMO: 'ER03000', AwardDate: '05/01/26', WorkCompletionDate: '05/30/26' }, // awarded long ago
    { OMO: 'ER04000', AwardDate: '11/22/26', WorkCompletionDate: '12/30/26' }, // award in the future
    { OMO: 'ER05000', AwardDate: '11/10/26', WorkCompletionDate: '' }, // no finish date
    { OMO: 'TEST-0001', AwardDate: '11/10/26', WorkCompletionDate: '11/30/26' },
  ],
  sent: { ER01000: { sentAt: '2026-11-20' } },
  closed: { ER02000: { closedReason: 'No Access' } },
});
assert.deepEqual(r.map((x) => [x.omo, x.due, x.days, x.given]), [
  ['ER07567', '2026-10-20', -32, 10],
  ['ER09579', '2026-11-20', -1, 15],
  ['ER09417', '2026-11-25', 4, 20],
]);
assert.equal(daysLeftText(-32), '32 days late');
assert.equal(daysLeftText(-1), '1 day late');
assert.equal(daysLeftText(0), 'due today');
assert.equal(daysLeftText(1), '1 day left');
assert.equal(daysLeftText(4), '4 days left');
assert.deepEqual(awardCountdown({ awards: null, today: '2026-11-21' }), []);
console.log('award-countdown tests passed');
