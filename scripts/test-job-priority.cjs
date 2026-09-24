const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/job-priority.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleUnderTest = { exports: {} };
new Function('exports', 'module', source)(moduleUnderTest.exports, moduleUnderTest);
const { calendarDay, maturityDate, isPendingJob, jobPriority, matchesMapStatus } = moduleUnderTest.exports;
const now = new Date('2026-09-23T16:00:00Z');
const { matchesAwardLookback } = moduleUnderTest.exports;
assert.equal(matchesAwardLookback({AwardDate:'08/28/26'},26,new Date('2026-09-23T16:00:00Z')),true);
assert.equal(matchesAwardLookback({AwardDate:'08/28/26'},25,now),false);
assert.equal(matchesAwardLookback({AwardDate:'2026-09-23'},0,now),true);
assert.equal(matchesAwardLookback({AwardDate:'2026-09-24'},30,now),false);
assert.equal(matchesAwardLookback({AwardDate:'02/30/26'},365,now),false);
assert.equal(matchesAwardLookback({WorkStartDate:'09/23/26'},30,now),false);
assert.equal(matchesAwardLookback({},null,now),true);
assert.equal(matchesAwardLookback({AwardDate:'03/08/26'},1,new Date('2026-03-09T04:01:00Z')),true);
const due = (days) => new Date((calendarDay('2026-09-23') - days) * 86400000).toISOString().slice(0, 10);
for (const [days, band] of [[-1,'upcoming'],[0,'today'],[1,'1-30'],[30,'1-30'],[31,'31-60'],[60,'31-60'],[61,'61-90'],[90,'61-90'],[91,'91-150'],[150,'91-150'],[151,'150+']]) {
  const p = jobPriority({ WorkCompletionDate: due(days), AwardDate: '01/01/25' }, now);
  assert.equal(p.days, days); assert.equal(p.band, band);
}
for (const invalid of ['02/30/26','2026-02-29','2026-13-01','09/31/26','2026-09-23T00:00:00Z','garbage']) assert.equal(calendarDay(invalid), null);
assert.equal(calendarDay('02/29/24'), calendarDay('2024-02-29'));
assert.equal(jobPriority({ WorkCompletionDate: '09/23/26' }, new Date('2026-09-23T03:59:59Z')).days, -1);
assert.equal(jobPriority({ WorkCompletionDate: '09/23/26' }, new Date('2026-09-23T04:00:00Z')).days, 0);
assert.equal(jobPriority({ WorkCompletionDate: '03/08/26' }, new Date('2026-03-09T04:01:00Z')).days, 1);
assert.equal(jobPriority({ WorkCompletionDate: '11/01/26' }, new Date('2026-11-02T05:01:00Z')).days, 1);
for (const status of ['Work Completed','WORK_COMPLETED','Completed By Others','Archived','Cancelled']) assert.equal(jobPriority({ Status: status, WorkCompletionDate: '01/01/26' }, now).days, null);
for (const status of ['Partial Work Completed','No Access','Appointment Requested','Not Completed','Awarded']) assert.equal(isPendingJob({ Status: status }), true);
assert.equal(isPendingJob({ Archived: 'true' }), false);
assert.equal(isPendingJob({ Archived: 'false' }), true);
assert.equal(isPendingJob({ WorkflowStatus: 'Work Completed', Status: 'Awarded' }), false);
assert.equal(jobPriority({ AwardDate: '01/01/26' }, now).band, 'unknown');
assert.equal(jobPriority({ MaturityDate: 'bad', WorkCompletionDate: '01/01/26' }, now).label, 'Maturity date invalid');
assert.equal(maturityDate({ MaturityDate: '', WorkCompletionDate: '01/01/26' }), '');
assert.equal(maturityDate({ ActualWorkCompletionDate: '09/20/26' }), '');
console.log('PASS: maturity bands, invalid dates, NY midnight/DST, source precedence, closed jobs and partial outcomes');
for (const status of ['REFUSED_ACCESS', 'No Access - 2nd Attempt', 'NO_ACCESS_COMPLETE', 'WORK_COMPLETED', 'WORK_COMPLETED_BY_OTHERS', 'Cancelled']) {
  const job = { OMO: 'SAMPLE123', WorkflowStatus: status };
  assert.equal(matchesMapStatus(job, 'pending'), false, status);
  assert.equal(matchesMapStatus(job, 'closed'), true, status);
  assert.equal(matchesMapStatus(job, 'all'), true, status);
}
for (const status of ['Pending', 'Awarded', 'PARTIAL_WORK', 'WORK_IN_PROGRESS', 'NO_ACCESS_1_WAITING_72H']) assert.equal(matchesMapStatus({ WorkflowStatus: status }, 'pending'), true, status);
assert.equal(isPendingJob({ ArchivedFromMap: true, WorkflowStatus: 'Pending' }), false);
assert.equal(isPendingJob({ archivedFromMap: 'true' }), false);
console.log('PASS: pending-only map eligibility; handled outcomes remain accessible in All jobs.');
