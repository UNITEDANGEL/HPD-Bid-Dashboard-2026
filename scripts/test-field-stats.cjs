const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/field-stats.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { fieldStats, periodDays } = mod.exports;

// Wednesday 2026-10-14, 9:30 PM in New York (already Thursday in UTC).
const now = new Date('2026-10-15T01:30:00Z');

assert.deepEqual(periodDays('today', now), ['2026-10-14']);
assert.deepEqual(periodDays('week', now), ['2026-10-12', '2026-10-13', '2026-10-14']);
assert.equal(periodDays('month', now).length, 14);
assert.equal(periodDays('month', now)[0], '2026-10-01');

const jobs = [
  // Completed tonight after 8 PM New York: still counts as today.
  { OMO: 'A', AwardAmount: '390.00', FieldArrivedAt: '2026-10-15T00:10:00Z',
    FieldVisitHistory: [{ recordedAt: '2026-10-15T00:40:00Z', outcome: 'WORK_COMPLETED', note: '' }], PackageEmailedAt: '2026-10-15T01:00:00Z' },
  // No access Monday, then an appointment and a cleared outcome: no outcome counted.
  { OMO: 'B', AwardAmount: '200', FieldVisitHistory: [
    { recordedAt: '2026-10-12T14:00:00Z', outcome: 'NO_ACCESS_1_WAITING_72H', note: '' },
    { recordedAt: '2026-10-13T14:00:00Z', outcome: null, note: 'Outcome cleared (was No access).' },
  ] },
  // Refused last week: outside this week, inside this month.
  { OMO: 'C', FieldVisitHistory: [{ recordedAt: '2026-10-06T15:00:00Z', outcome: 'REFUSED_ACCESS', note: '' }] },
  // Partial work yesterday.
  { OMO: 'D', AwardAmount: '$1,000.50', FieldVisitHistory: [{ recordedAt: '2026-10-13T18:00:00Z', outcome: 'PARTIAL_WORK', note: '' }] },
  // The test job never counts.
  { OMO: 'TEST-0001', AwardAmount: '100', FieldVisitHistory: [{ recordedAt: '2026-10-14T16:00:00Z', outcome: 'WORK_COMPLETED' }] },
  // Nothing recorded on the phone.
  { OMO: 'E', AwardAmount: '500', FieldOutcome: 'WORK_COMPLETED' },
];
const skip = (job) => job.OMO === 'TEST-0001';

const today = fieldStats(jobs, 'today', { skip }, now);
assert.equal(today.label, 'Today · Wed, Oct 14');
assert.deepEqual(today.counts, { visited: 1, completed: 1, partial: 0, noAccess: 0, refused: 0, byOthers: 0, emailed: 1 });
assert.equal(today.earned, 390);

const week = fieldStats(jobs, 'week', { skip }, now);
assert.deepEqual(week.counts, { visited: 3, completed: 1, partial: 1, noAccess: 0, refused: 0, byOthers: 0, emailed: 1 });
assert.equal(week.earned, 1390.5);
assert.deepEqual(week.days.map((d) => [d.label, d.visited, d.completed]), [['Mon', 1, 0], ['Tue', 2, 1], ['Wed', 1, 1]]);

const month = fieldStats(jobs, 'month', { skip }, now);
assert.equal(month.counts.refused, 1);
assert.equal(month.counts.visited, 4);
assert.equal(month.label, 'This month · October 2026');

console.log('field stats tests passed');
