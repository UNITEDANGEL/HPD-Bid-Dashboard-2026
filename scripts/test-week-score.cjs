const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/week-score.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require);
const { weekScore, weekStart } = m.exports;
assert.equal(weekStart('2026-11-14'), '2026-11-09'); // Saturday -> Monday
assert.equal(weekStart('2026-11-09'), '2026-11-09');
assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
const s = weekScore({
  today: '2026-11-13',
  sent: { A: { sentAt: '2026-11-09' }, B: { sentAt: '2026-11-13' }, C: { sentAt: '2026-11-08' }, D: {} },
  awards: [{ OMO: 'X1', AwardDate: '11/10/26' }, { OMO: 'TEST-0001', AwardDate: '11/10/26' }, { OMO: 'X2', AwardDate: '11/01/26' }],
  payments: { recent: [{ date: '2026-11-11', status: 'Paid', amount: 1000.5 }, { date: '2026-11-11', status: 'Disbursed', amount: 5 }, { date: '2026-11-02', status: 'Paid', amount: 9 }] },
});
assert.deepEqual(s, { from: '2026-11-09', sent: 2, won: 1, moneyIn: 1000.5, trophy: false, stars: 1 });
const good = weekScore({ today: '2026-11-13', sent: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`J${i}`, { sentAt: '2026-11-12' }])), payments: { recent: [{ date: '2026-11-12', status: 'Paid', amount: 10 }] } });
assert.equal(good.trophy, true);
assert.equal(weekScore({ today: '2026-11-13' }).trophy, false);
console.log('week-score tests passed');
