const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/month-glance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require);
const { monthGlance } = m.exports;
const g = monthGlance({
  month: '2026-11',
  sent: { A: { sentAt: '2026-11-03' }, B: { sentAt: '2026-11-20' }, C: { sentAt: '2026-10-30' }, D: {} },
  pipPaid: { jobs: { A: { status: 'paid', outstanding: 0 }, B: { status: 'not paid yet', outstanding: 388 }, C: { status: 'partly paid', outstanding: 100 }, D: { status: 'not paid yet', outstanding: -5 } } },
  payments: { byMonth: { '2026-11': 1200.5, '2026-10': 9 }, totals: { disbursed: 509 }, generatedAt: '2026-11-10T01:00:00Z' },
});
assert.deepEqual(g, { month: '2026-11', jobsDone: 2, paid: 1200.5, waiting: 488, onTheWay: 509, paidAsOf: '2026-11-10' });
const empty = monthGlance({ month: '2026-11' });
assert.equal(empty.jobsDone + empty.paid + empty.waiting + empty.onTheWay, 0);
console.log('month-glance tests passed');
