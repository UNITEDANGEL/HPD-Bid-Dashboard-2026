const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/field-next-action.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { nextFieldAction: next, paperworkReviewHref, fieldOutcomePatch, FIELD_OUTCOMES } = mod.exports;
const none = { before: 0, after: 0 };
const { arrivalVisitPatch, suggestedPhotoKind } = mod.exports;
const arrival = arrivalVisitPatch('2026-09-23T16:00:00Z');
assert.equal(arrival.FieldArrivedAt, arrival.VisitStartedAt);
assert.equal(arrival.ActualWorkStartDate, undefined);
assert.equal(arrival.ActualWorkCompletionDate, undefined);
assert.equal(arrival.WorkflowStatus, undefined);
assert.equal(next({ arrived: arrival.FieldArrivedAt, visit: arrival.VisitStartedAt }, none).key, 'before');
assert.equal(suggestedPhotoKind({}), 'before');
assert.equal(suggestedPhotoKind({ work: 'saved' }), 'after');
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
assert.equal(next({}, { before: 1, after: 1 }).key, 'record');
for (const outcome of Object.keys(FIELD_OUTCOMES).filter(value => value !== 'APPOINTMENT_REQUESTED')) {
  const link = new URL(mod.exports.paperworkGenerateHref('TEST 1', outcome), 'https://example.test');
  assert.equal(link.searchParams.get('auto'), 'package');
  assert.equal(link.searchParams.get('signature'), 'none');
  assert.notEqual(link.searchParams.get('outcome'), 'pending');
}
assert.throws(() => mod.exports.paperworkGenerateHref('TEST', 'APPOINTMENT_REQUESTED'));
const page = fs.readFileSync('app/paperwork/page.tsx', 'utf8');
const start = page.indexOf('  async function markPackageGenerated(');
const end = page.indexOf('  async function generateAffidavitPdf(', start);
const marker = ts.transpileModule(page.slice(start, end) + '\nthis.mark = markPackageGenerated;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const patches = [];
const context = { saveLocalPackageOverride: (id, patch) => patches.push(patch), HPD_STATUS_WORKER_URL: 'https://test.invalid', fetch: async () => ({ok:true}) };
new Function(`with(this) { ${marker} }`).call(context);
(async () => {
  await context.mark('TEST');
  assert.equal(patches[0].ArchivedFromMap, undefined);
  assert.equal(patches[0].PackageReviewStatus, 'Pending review');
  await context.mark('TEST', true);
  assert.equal(patches[1].ArchivedFromMap, true);
  assert.equal(patches[1].PackageReviewStatus, 'Approved');
  assert.ok(!page.includes('else if (shouldAutoGeneratePackage) nextOutcome = "work_completed"'));
  console.log('PASS: explicit unsigned outcome generation and archive only after approval');
})().catch(error => { console.error(error); process.exitCode=1; });
