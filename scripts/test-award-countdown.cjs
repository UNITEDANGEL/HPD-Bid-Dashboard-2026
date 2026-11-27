const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (f) => { const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, (p) => p === './job-priority' ? load('lib/job-priority.ts') : require(p)); return m.exports; };
const { awardCountdown, daysLeftText, finishByText, nyDay, finishMonth, shiftMonth, jobFinishDays, finishPlanBoost, finishStopLabel, maturityWeek, maturityMoney, maturityWorkerText, maturityNotStarted, maturityNeedsAfter, maturityStuck, photosStuckDays, pinNeedsAfter, afterAskText } = load('lib/award-countdown.ts');
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
// 📤 Send this week's list to the worker: OMO, address, finish date; no money; empty list = empty text.
{
  const t = maturityWorkerText([{ omo: 'ZZ1', due: '2026-11-25', days: 1, given: 9, amount: 900 }, { omo: 'ZZ2', due: '2026-11-30', days: 6, given: 9 }], { ZZ1: ' 12  Main St, 10472 ' }, '2026-11-24');
  assert.equal(t, 'Jobs to finish this week (2), closest date first:\n1. ZZ1 - 12 Main St, 10472\n   Finish by Wed, Nov 25 (1 day left)\n2. ZZ2\n   Finish by Mon, Nov 30 (6 days left)\nSend me the photos when each one is done. Thanks!');
  assert.ok(!t.includes('$'));
  assert.equal(maturityWorkerText([], {}, '2026-11-24'), '');
}
// 🚧 Not started yet: a visit / on-site step / photo count on the saved job, or a visit or photo on this phone, counts as started.
{
  const mw = ['A', 'B', 'C', 'D', 'E'].map((omo) => ({ omo, due: '', days: 1, given: 1 }));
  assert.deepEqual(maturityNotStarted(mw, { overrides: { A: { LastFieldVisitAt: '2026-11-24' }, B: { BeforePhotoCount: 3 }, D: { FieldOutcome: '' } }, started: ['c'] }), ['D', 'E']);
  assert.deepEqual(maturityNotStarted(mw.slice(0, 1), { overrides: null, started: null }), ['A']);
}
// 🟠 Before but no After (plan item 44): Before on this phone or saved on the job, and no After anywhere.
{
  const mw = ['A', 'B', 'C', 'D', 'E'].map((omo) => ({ omo, due: '', days: 1, given: 1 }));
  assert.deepEqual(maturityNeedsAfter(mw, { overrides: { B: { BeforePhotoCount: 2 }, C: { BeforePhotoCount: 1, AfterPhotoCount: 1 }, D: { AfterPhotoCount: 3 } }, photos: { a: { before: 2, after: 0 }, d: { before: 1, after: 0 }, e: { before: 0, after: 0 } } }), ['A', 'B']);
  assert.deepEqual(maturityNeedsAfter(mw, { overrides: null, photos: null }), []);
}
// 📷 Ask the worker for the After photo (plan item 46): job, address, finish date; nothing private.
{
  const t = afterAskText({ omo: 'ZZ1', due: '2026-11-28', days: 2, given: 9 }, '  12  Main St ', '2026-11-26');
  assert.match(t, /^Job ZZ1 - 12 Main St/);
  assert.match(t, /Finish by .*2 days left/);
  assert.match(t, /After photos/);
  assert.match(afterAskText({ omo: 'ZZ2', due: '2026-11-28', days: 2, given: 9 }, '', '2026-11-26'), /^Job ZZ2\nFinish by/);
}
// 🟠 Needs After on the map (plan item 45): due within 7 days or late, Before saved on the job, no After.
{
  assert.equal(pinNeedsAfter({ BeforePhotoCount: 2 }, 3), true);
  assert.equal(pinNeedsAfter({ BeforePhotoCount: 2 }, -2), true, 'late still needs After');
  assert.equal(pinNeedsAfter({ BeforePhotoCount: 2 }, 9), false, 'not due this week');
  assert.equal(pinNeedsAfter({ BeforePhotoCount: 2, AfterPhotoCount: 1 }, 3), false);
  assert.equal(pinNeedsAfter({ BeforePhotoCount: 2 }, undefined), false, 'not awarded / already sent');
  assert.equal(pinNeedsAfter(null, 1), false);
}
// ⏳ Photos stuck (27 Nov): Before 3+ days old and no After.
{
  const now = Date.parse("2026-11-27T15:00:00Z");
  assert.equal(photosStuckDays({}, { before: 2, after: 0, beforeAt: "2026-11-23T15:00:00Z" }, now), 4);
  assert.equal(photosStuckDays({}, { before: 2, after: 0, beforeAt: "2026-11-26T15:00:00Z" }, now), null, "only 1 day");
  assert.equal(photosStuckDays({ BeforePhotoCount: 1, AfterPhotoCount: 1, WorkerNewAt: "2026-11-01T00:00:00Z" }, null, now), null, "has After");
  assert.equal(photosStuckDays({ BeforePhotoCount: 1 }, null, now), null, "no date known");
  const mw = ["A", "B", "C"].map((omo) => ({ omo, due: "", days: 1, given: 1 }));
  assert.deepEqual(maturityStuck(mw, { now, overrides: { B: { BeforePhotoCount: 2, WorkerNewAt: "2026-11-20T15:00:00Z" } }, photos: { a: { before: 1, after: 0, beforeAt: "2026-11-24T14:00:00Z" }, c: { before: 1, after: 0, beforeAt: "2026-11-27T10:00:00Z" } } }), { A: 3, B: 7 });
}
