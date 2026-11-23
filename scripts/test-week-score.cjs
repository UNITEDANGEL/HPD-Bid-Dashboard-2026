const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/week-score.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require);
const { weekScore, weekStart, trend, trendMark } = m.exports;
assert.equal(weekStart('2026-11-14'), '2026-11-09'); // Saturday -> Monday
assert.equal(weekStart('2026-11-09'), '2026-11-09');
assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
const s = weekScore({
  today: '2026-11-13',
  sent: { A: { sentAt: '2026-11-09' }, B: { sentAt: '2026-11-13' }, C: { sentAt: '2026-11-08' }, D: {} },
  awards: [{ OMO: 'X1', AwardDate: '11/10/26' }, { OMO: 'TEST-0001', AwardDate: '11/10/26' }, { OMO: 'X2', AwardDate: '11/01/26' }],
  payments: { recent: [{ date: '2026-11-11', status: 'Paid', amount: 1000.5 }, { date: '2026-11-11', status: 'Disbursed', amount: 5 }, { date: '2026-11-02', status: 'Paid', amount: 9 }] },
});
assert.deepEqual(s, { from: '2026-11-09', sent: 2, won: 1, moneyIn: 1000.5, trophy: false, stars: 1, last: { sent: 0, won: 0, moneyIn: 9 } });
// Last week = the same days (Mon 2 Nov to Fri 6 Nov): C sent Sun 8 Nov and X2 won Sun 1 Nov are outside it.
const lw = weekScore({ today: '2026-11-11', sent: { A: { sentAt: '2026-11-03' }, B: { sentAt: '2026-11-05' }, C: { sentAt: '2026-11-10' } } });
assert.deepEqual([lw.sent, lw.last.sent], [1, 1]); // Wed 11 Nov: last week counts Mon 2 to Wed 4 Nov, not B on Thu 5 Nov
assert.equal(trend(3, 1), 'up'); assert.equal(trend(1, 3), 'down'); assert.equal(trend(2, 2), 'same');
assert.equal(trendMark(3, 1), '▲'); assert.equal(trendMark(0, 4), '▼'); assert.equal(trendMark(0, 0), '=');
const good = weekScore({ today: '2026-11-13', sent: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`J${i}`, { sentAt: '2026-11-12' }])), payments: { recent: [{ date: '2026-11-12', status: 'Paid', amount: 10 }] } });
assert.equal(good.trophy, true);
assert.equal(weekScore({ today: '2026-11-13' }).trophy, false);
// 📊 On time vs late (plan item 27): sent on/before HPD's finish date = on time; the latest award's date counts.
const { onTimeLate } = m.exports;
const ot = onTimeLate({
  today: '2026-11-13',
  sent: { A: { sentAt: '2026-11-10' }, B: { sentAt: '2026-11-12' }, C: { sentAt: '2026-11-11' }, D: { sentAt: '2026-11-04' }, E: { sentAt: '2026-11-12' }, F: { sentAt: '2026-11-12' } },
  awards: [
    { OMO: 'A', AwardDate: '11/01/26', WorkCompletionDate: '11/10/26' }, // same day = on time
    { OMO: 'B', AwardDate: '10/01/26', WorkCompletionDate: '10/20/26' },
    { OMO: 'B', AwardDate: '11/01/26', WorkCompletionDate: '11/20/26' }, // awarded again: on time
    { OMO: 'C', AwardDate: '10/01/26', WorkCompletionDate: '11/05/26' }, // late
    { OMO: 'D', AwardDate: '10/01/26', WorkCompletionDate: '11/01/26' }, // last week, late
    { OMO: 'E', AwardDate: '10/01/26' }, // no finish date: left out
    { OMO: 'TEST-0001', AwardDate: '10/01/26', WorkCompletionDate: '10/02/26' },
  ],
});
assert.deepEqual(ot, { onTime: 2, late: 1, lateJobs: ['C'], lateList: [{ omo: 'C', days: 6, sent: '2026-11-11', due: '2026-11-05' }], last: { onTime: 0, late: 1, lateJobs: ['D'], lateList: [{ omo: 'D', days: 3, sent: '2026-11-04', due: '2026-11-01' }] } });
assert.deepEqual(onTimeLate({ today: '2026-11-13' }), { onTime: 0, late: 0, lateJobs: [], lateList: [], last: { onTime: 0, late: 0, lateJobs: [], lateList: [] } });
console.log('week-score tests passed');
