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
  { OMO: 'D', AwardAmount: '$1,000.50', PackageChargeAmount: '650.00', FieldVisitHistory: [{ recordedAt: '2026-10-13T18:00:00Z', outcome: 'PARTIAL_WORK', note: '' }] },
  // The test job never counts.
  { OMO: 'TEST-0001', AwardAmount: '100', FieldVisitHistory: [{ recordedAt: '2026-10-14T16:00:00Z', outcome: 'WORK_COMPLETED' }] },
  // Nothing recorded on the phone.
  { OMO: 'E', AwardAmount: '500', FieldOutcome: 'WORK_COMPLETED' },
];
const skip = (job) => job.OMO === 'TEST-0001';

const today = fieldStats(jobs, 'today', { skip }, now);
assert.equal(today.label, 'Today · Wed, Oct 14');
assert.deepEqual(today.counts, { visited: 1, completed: 1, partial: 0, noAccess: 0, refused: 0, byOthers: 0, emailed: 1, serviceCalls: 0 });
assert.equal(today.earned, 390);

const week = fieldStats(jobs, 'week', { skip }, now);
assert.deepEqual(week.counts, { visited: 3, completed: 1, partial: 1, noAccess: 0, refused: 0, byOthers: 0, emailed: 1, serviceCalls: 0 });
// D's invoice charged $650 for the partial work, not the $1,000.50 bid.
assert.equal(week.earned, 1040);
assert.deepEqual(week.days.map((d) => [d.label, d.visited, d.completed]), [['Mon', 1, 0], ['Tue', 2, 1], ['Wed', 1, 1]]);

const month = fieldStats(jobs, 'month', { skip }, now);
assert.equal(month.counts.refused, 1);
// C was refused (no bid on file -> $100 service call): counted in the month, not this week.
assert.equal(month.counts.serviceCalls, 1);
assert.equal(month.earnedService, 100);
assert.equal(month.counts.visited, 4);
assert.equal(month.label, 'This month · October 2026');

// The owner's example week: a $1,000 job completed, plus two service calls - a no-access job under
// $2,000 ($100, billable on its 2nd try) and a refused job of $2,000 or more ($300) = $1,400.
const example = [
  { OMO: 'W1', AwardAmount: '1000.00', FieldVisitHistory: [{ recordedAt: '2026-10-12T15:00:00Z', outcome: 'WORK_COMPLETED' }] },
  { OMO: 'W2', AwardAmount: '1500.00', NoAccessFirstAttemptAt: '2026-10-09T14:00:00Z', NoAccessSecondAttemptAt: '2026-10-13T14:00:00Z', FieldVisitHistory: [
    { recordedAt: '2026-10-09T14:00:00Z', outcome: 'NO_ACCESS_1_WAITING_72H' },
    { recordedAt: '2026-10-13T14:00:00Z', outcome: 'NO_ACCESS_1_WAITING_72H', note: '2nd try: no access' },
  ] },
  { OMO: 'W3', AwardAmount: '2575.95', FieldVisitHistory: [{ recordedAt: '2026-10-14T16:00:00Z', outcome: 'REFUSED_ACCESS' }] },
  // 1st no-access try only: not billable yet, adds nothing.
  { OMO: 'W4', AwardAmount: '900.00', NoAccessFirstAttemptAt: '2026-10-14T13:00:00Z', FieldVisitHistory: [{ recordedAt: '2026-10-14T13:00:00Z', outcome: 'NO_ACCESS_1_WAITING_72H' }] },
  // The invoice says $250 for this service call: that wins over the $100 rule.
  { OMO: 'W5', AwardAmount: '800.00', PackageChargeAmount: '250.00', FieldVisitHistory: [{ recordedAt: '2026-10-12T18:00:00Z', outcome: 'WORK_COMPLETED_BY_OTHERS' }] },
];
const exampleWeek = fieldStats(example.slice(0, 4), 'week', {}, now);
assert.equal(exampleWeek.earnedWork, 1000);
assert.equal(exampleWeek.earnedService, 400);
assert.equal(exampleWeek.earned, 1400);
assert.equal(exampleWeek.counts.serviceCalls, 2);
assert.equal(exampleWeek.counts.noAccess, 2);
assert.equal(fieldStats(example, 'week', {}, now).earned, 1650);
// Last week's view doesn't see the 2nd try (Oct 13) yet: the 1st try (Oct 9) alone pays nothing.
assert.equal(fieldStats([example[1]], 'month', {}, new Date('2026-10-10T16:00:00Z')).earned, 0);

// Same $100 / $300 rule as the paperwork's invoice.
const paperSrc = fs.readFileSync(require.resolve('../lib/paperwork.ts'), 'utf8');
assert.match(paperSrc, /NO_WORK_SERVICE_CHARGE = 100;/);
assert.match(paperSrc, /NO_WORK_LARGE_SERVICE_CHARGE = 300;/);
assert.match(paperSrc, /NO_WORK_LARGE_JOB_THRESHOLD = 2000;/);
assert.equal(fieldStats([{ OMO: 'X', AwardAmount: '1999.99', FieldVisitHistory: [{ recordedAt: '2026-10-14T16:00:00Z', outcome: 'REFUSED_ACCESS' }] }], 'today', {}, now).earned, 100);
assert.equal(fieldStats([{ OMO: 'X', AwardAmount: '2000.00', FieldVisitHistory: [{ recordedAt: '2026-10-14T16:00:00Z', outcome: 'REFUSED_ACCESS' }] }], 'today', {}, now).earned, 300);

console.log('field stats tests passed');
