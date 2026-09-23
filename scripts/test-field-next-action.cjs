const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/field-next-action.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { nextFieldAction: next, paperworkReviewHref, fieldOutcomePatch, FIELD_OUTCOMES } = mod.exports;
const none = { before: 0, after: 0 };
assert.equal(next({}, none).key, 'arrived');
assert.equal(next({ arrived: 'saved' }, none).key, 'visit');
assert.equal(next({ arrived: 'saved', visit: 'saved' }, none).key, 'before');
assert.equal(next({ arrived: 'saved', visit: 'saved' }, { before: 1, after: 0 }).key, 'work');
assert.equal(next({ arrived: 'saved', visit: 'saved', work: 'saved' }, none).key, 'after');
assert.equal(next({ arrived: 'saved', visit: 'saved', work: 'saved' }, { before: 1, after: 1 }).key, 'record');
for (const status of ['Refused Access', 'No Access', 'Work Completed', 'Partial Work', 'Completed by others']) assert.equal(next({ status }, none).key, 'review');
assert.equal(next({ status: 'Appointment requested' }, none).key, 'record');
for (const media of [true, false]) {
  const url = new URL(paperworkReviewHref('TEST 1', media), 'https://example.test');
  assert.equal(url.searchParams.get('job'), 'TEST 1');
  assert.equal(url.searchParams.get('media'), media ? 'all' : 'none');
  for (const key of ['auto','fieldStatus','outcome','workCompletedAt','refusedAt','noAccessAt']) assert.equal(url.searchParams.has(key), false);
}
const job = { FieldVisitHistory: [{ note: 'Earlier visit' }] };
for (const outcome of Object.keys(FIELD_OUTCOMES)) {
  const patch = fieldOutcomePatch(job, outcome, 'Sample note', '2026-09-23T16:00:00Z');
  assert.equal(patch.FieldOutcome, outcome);
  assert.equal(patch.FieldVisitHistory.length, 2);
  assert.equal(patch.ArchivedFromMap, undefined);
  assert.equal(patch.ActualWorkCompletionDate !== undefined, outcome === 'WORK_COMPLETED');
}
assert.equal(job.FieldVisitHistory.length, 1);
assert.equal(fieldOutcomePatch(job, '', 'Note only', '2026-09-23T16:00:00Z').FieldOutcome, undefined);
assert.throws(() => fieldOutcomePatch(job, '', '', '2026-09-23T16:00:00Z'));
assert.throws(() => fieldOutcomePatch(job, 'INVALID', '', '2026-09-23T16:00:00Z'));
assert.equal(fieldOutcomePatch({ NoAccessFirstAttemptAt: 'previous' }, 'NO_ACCESS_1_WAITING_72H', '', '2026-09-23T16:00:00Z').NoAccessFirstAttemptAt, undefined);
console.log('PASS: guided steps, six outcomes, append-only visit history, no inferred completion/archival, review-only links');
