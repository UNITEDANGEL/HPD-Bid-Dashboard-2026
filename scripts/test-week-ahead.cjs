// 📅 Next 7 days (plan, 19 Nov): appointments, bids due, notice deadlines and 2nd tries, day by day.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/week-ahead.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} }; new Function('exports', 'module', code)(mod.exports, mod);
const { weekAhead, weekLine, clockMinutes, addDays } = mod.exports;
const today = '2026-11-19';
// The clock is the sample day (noon NY), so the sample notices stay in the future whatever the real date is.
Date.now = () => Date.parse('2026-11-19T17:00:00Z');
assert.equal(addDays(today, 12), '2026-12-01');
assert.equal(clockMinutes('9:30 AM'), 570); assert.equal(clockMinutes('12:00 PM'), 720); assert.equal(clockMinutes('14:15'), 855); assert.equal(clockMinutes(''), 1440);
const week = weekAhead({
  today,
  appointments: [
    { omo: 'EQ1', address: '1 A ST', date: '2026-11-20', start: '14:00', end: '16:00', state: 'confirmed' },
    { omo: 'EQ2', address: '2 B ST', date: '2026-11-20', start: '09:00', end: '11:00', state: 'requested' },
    { omo: 'EQ3', address: '3 C ST', date: '2026-11-30', start: '09:00', end: '11:00', state: 'confirmed' }, // past the week
    { omo: 'EQ4', address: '4 D ST', date: '2026-11-21', start: '09:00', end: '11:00', state: 'cancelled' },
  ],
  bids: [
    { omo: 'ER1', address: '10 E ST', bidDue: today, bidDueTime: '11:59 PM', sent: false },
    { omo: 'ER2', address: '11 F ST', bidDue: today, bidDueTime: '10:00 AM', sent: true },
    { omo: 'ER3', address: '12 G ST', bidDue: '2026-11-18', bidDueTime: '10:00 AM', sent: false }, // yesterday: gone
  ],
  notices: [
    { omo: 'EP1', dueAt: '2026-11-17T15:00:00Z', hours: 24, open: true },  // overdue -> today, first
    { omo: 'EP2', dueAt: '2026-11-22T15:00:00Z', hours: 72, open: true },
    { omo: 'EP3', dueAt: '2026-11-22T15:00:00Z', hours: 72, open: false }, // answered
  ],
  secondTries: [{ omo: 'EQ9', address: '9 H ST', dueDay: '2026-11-16' }, { omo: 'EQ8', address: '8 I ST', dueDay: '2026-11-23' }],
});
assert.equal(week.length, 7);
assert.deepEqual(week.map((d) => d.label).slice(0, 2), ['Today', 'Tomorrow']);
assert.equal(week[2].label, 'Saturday, Nov 21');
assert.deepEqual(week[0].items.map((i) => i.omo), ['EP1', 'ER2', 'ER1', 'EQ9'], 'today: overdue notice, bids by time, late 2nd tries at the end');
assert.ok(week[0].items[0].late && /overdue/.test(week[0].items[0].text));
assert.ok(week[0].items[1].done && /Bid sent/.test(week[0].items[1].text));
assert.equal(week[0].items[3].text, '2nd no-access try: waiting since 11/16');
assert.equal(week[0].items[2].text, 'Bid due 11:59 PM');
assert.deepEqual(week[1].items.map((i) => [i.omo, i.text]), [['EQ2', 'Asked for 9:00 AM–11:00 AM'], ['EQ1', 'Appointment 2:00 PM–4:00 PM']]);
assert.deepEqual(week[3].items.map((i) => i.omo), ['EP2']);
assert.match(week[3].items[0].text, /^72-hour notice due 10:00 AM$/);
assert.deepEqual(week[4].items.map((i) => i.omo), ['EQ8']);
assert.ok(!week.some((d) => d.items.some((i) => ['EQ3', 'EQ4', 'ER3', 'EP3'].includes(i.omo))));
assert.equal(weekLine(week), 'Next 7 days: 2 appointments, 1 bid due, 2 notice deadlines, 2 second tries.');
assert.equal(weekLine(weekAhead({ today, appointments: [], bids: [], notices: [], secondTries: [] })), 'Nothing booked or due in the next 7 days.');
console.log('PASS next 7 days: appointments, bids (sent ticked), notice deadlines (overdue on today), 2nd tries, each day in time order; outside the week left out');
