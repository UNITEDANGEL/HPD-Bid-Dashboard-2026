const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (f) => { const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, (p) => p === './job-priority' ? load('lib/job-priority.ts') : require(p)); return m.exports; };
const { awardCountdown, daysLeftText, finishByText, nyDay, finishMonth, shiftMonth, jobFinishDays, finishPlanBoost, finishStopLabel, maturityWeek, maturityMoney } = load('lib/award-countdown.ts');
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
// 👷 Finish-by date for the worker message
assert.equal(finishByText('11/24/26', '2026-11-21'), 'Tue, Nov 24 (3 days left)');
assert.equal(finishByText('2/9/26', '2026-11-21'), 'Mon, Feb 9 (285 days late)');
assert.equal(finishByText('2026-11-21T00:00:00', '2026-11-21'), 'Sat, Nov 21 (due today)');
assert.equal(finishByText('01/05/27', '2026-11-21'), 'Tue, Jan 5, 2027 (45 days left)');
assert.equal(finishByText('soon', '2026-11-21'), 'soon');
assert.equal(finishByText('', '2026-11-21'), '');
assert.equal(nyDay(new Date('2026-11-22T03:00:00Z')), '2026-11-21');
// 📅 Finish dates calendar: Nov 2026 starts on a Sunday, 30 days -> 5 weeks; jobs land on their due day.
const cal = finishMonth(r, '2026-11', '2026-11-21');
assert.equal(cal.length, 5);
assert.ok(cal.every((w) => w.length === 7));
assert.equal(cal[0][0].date, 1);
const flat = cal.flat().filter(Boolean);
assert.equal(flat.length, 30);
assert.deepEqual(flat.find((d) => d.iso === '2026-11-20').jobs.map((j) => j.omo), ['ER09579']);
assert.deepEqual(flat.find((d) => d.iso === '2026-11-25').jobs.map((j) => j.omo), ['ER09417']);
assert.equal(flat.find((d) => d.iso === '2026-11-21').today, true);
assert.equal(flat.filter((d) => d.jobs.length).length, 2);
const dec = finishMonth(r, '2026-12', '2026-11-21');
assert.equal(dec[0].filter((d) => d === null).length, 2); // Dec 1 2026 is a Tuesday
assert.deepEqual(finishMonth(r, 'nope', '2026-11-21'), []);
assert.equal(shiftMonth('2026-12', 1), '2027-01');
assert.equal(shiftMonth('2026-01', -1), '2025-12');
// Plan my day: closest HPD finish dates first (plan item 24).
assert.equal(jobFinishDays({ AwardDate: '11/05/26', WorkCompletionDate: '11/24/26' }, '2026-11-22'), 2);
assert.equal(jobFinishDays({ AwardDate: '2026-10-10', WorkCompletionDate: '2026-10-20T00:00:00' }, '2026-11-22'), -33);
assert.equal(jobFinishDays({ AwardDate: '2026-05-10', WorkCompletionDate: '2026-06-20' }, '2026-11-22'), null); // awarded long ago
assert.equal(jobFinishDays({ WorkCompletionDate: '11/24/26' }, '2026-11-22'), null); // not awarded
assert.equal(jobFinishDays({ OMO: 'TEST-0001', AwardDate: '11/05/26', WorkCompletionDate: '11/24/26' }, '2026-11-22'), null);
assert.equal(jobFinishDays({ AwardDate: '11/05/26', WorkCompletionDate: '' }, '2026-11-22'), null);
assert.equal(finishPlanBoost(null), 0);
assert.equal(finishPlanBoost(20), 0);
assert.ok(finishPlanBoost(-1) > finishPlanBoost(0) && finishPlanBoost(0) > finishPlanBoost(2) && finishPlanBoost(2) > finishPlanBoost(14) && finishPlanBoost(14) > 0);
assert.ok(finishPlanBoost(-33) >= finishPlanBoost(-1));
assert.equal(finishStopLabel(2), 'Due in 2 days (HPD finish date)');
assert.equal(finishStopLabel(1), 'Due in 1 day (HPD finish date)');
assert.equal(finishStopLabel(0), 'Due today (HPD finish date)');
assert.equal(finishStopLabel(-3), '3 days late (HPD finish date)');
// 💵 Maturity this week (plan item 35): today to 7 days on, closest first; late and later ones left out.
assert.deepEqual(maturityWeek([{ omo: 'B', due: '', days: 7, given: 1 }, { omo: 'L', due: '', days: -1, given: 1 }, { omo: 'A', due: '', days: 0, given: 1 }, { omo: 'X', due: '', days: 8, given: 1 }, { omo: 'C', due: '', days: 3, given: 1 }]).map((x) => x.omo), ['A', 'C', 'B']);
console.log('award-countdown tests passed');
// 💲 Money in this week's maturity: award amounts parsed ("$1,250.50"), missing ones count as 0.
{
  const cd = awardCountdown({ awards: [{ OMO: 'M1', AwardDate: '11/20/26', WorkCompletionDate: '11/26/26', AwardAmount: '$1,250.50' }, { OMO: 'M2', AwardDate: '11/20/26', WorkCompletionDate: '11/27/26' }], today: '2026-11-24' });
  assert.equal(cd.find((c) => c.omo === 'M1').amount, 1250.5);
  assert.equal(cd.find((c) => c.omo === 'M2').amount, null);
  assert.equal(maturityMoney(cd), 1250.5);
  assert.equal(maturityMoney([]), 0);
}
