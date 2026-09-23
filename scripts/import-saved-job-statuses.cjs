const fs = require('node:fs');
const path = require('node:path');
const Papa = require('papaparse');

const codes = {
  'Work Completed': 'WORK_COMPLETED',
  'Refused Access': 'REFUSED_ACCESS',
  'No Access - 1st Attempt': 'NO_ACCESS_1_WAITING_72H',
  'No Access - 2nd Attempt': 'NO_ACCESS_COMPLETE',
  'Work Completed by Other': 'WORK_COMPLETED_BY_OTHERS',
  'Partial Work Completed': 'PARTIAL_WORK',
  'Work In Progress': 'WORK_IN_PROGRESS',
  Pending: 'PENDING',
};
const dateFields = {
  WorkStartDateOverride: 'ActualWorkStartDate',
  WorkCompletionDateOverride: 'ActualWorkCompletionDate',
  NoAccessAttempt1Date: 'NoAccessFirstAttemptAt',
  NoAccessAttempt2Date: 'NoAccessSecondAttemptAt',
  RefusedAccessDate: 'RefusalDate',
  WorkCompletedByOtherDate: 'CompletedByOthersDate',
};
const statusKeys = ['WorkflowStatus', 'workflowStatus', 'FieldOutcome', 'fieldOutcome', 'StatusOverride', 'status', 'Status', 'JobStatus'];
const idOf = row => String(row.OMO || row.id || row.omo || '').trim().toUpperCase();

function importStatuses(jobs, records) {
  const byId = new Map();
  const report = { applied: [], conflicts: [], unmatched: [], existing: [] };
  for (const record of records) {
    if (!record.StatusOverride) continue;
    const id = String(record.RowID || '').split('|')[0].trim().toUpperCase();
    if (!id) continue;
    byId.set(id, [...(byId.get(id) || []), record]);
  }
  const counts = new Map();
  for (const job of jobs) counts.set(idOf(job), (counts.get(idOf(job)) || 0) + 1);
  for (const id of byId.keys()) if (!counts.has(id)) report.unmatched.push(id);
  const rows = jobs.map(job => {
    const id = idOf(job);
    const candidates = byId.get(id);
    if (!candidates) return job;
    if (candidates.length !== 1 || counts.get(id) !== 1 || !codes[candidates[0].StatusOverride]) {
      report.conflicts.push(id);
      return job;
    }
    // Existing outcomes may be newer or device-synced. Never replace them implicitly.
    if (statusKeys.some(key => String(job[key] || '').trim())) {
      report.existing.push(id);
      return job;
    }
    const source = candidates[0];
    const patch = {
      WorkflowStatus: codes[source.StatusOverride],
      StatusOverride: source.StatusOverride,
      status: source.StatusOverride,
      SavedStatusSource: 'status_overrides_2026.csv',
      SavedStatusUpdatedAt: source.StatusUpdatedAt || '',
    };
    for (const [from, to] of Object.entries(dateFields)) {
      if (source[from] && !job[to]) patch[to] = source[from];
    }
    report.applied.push({ id, status: source.StatusOverride });
    return { ...job, ...patch };
  });
  return { rows, report };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const parsed = Papa.parse(fs.readFileSync(path.join(root, 'data/status_overrides_2026.csv'), 'utf8'), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error('Saved status CSV is invalid; no files changed.');
  const results = ['data/COA_Fetcher_2026.json', 'public/data/COA_Fetcher_2026.json'].map(file => {
    const result = importStatuses(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), parsed.data);
    return { file, ...result };
  });
  for (const { file, rows, report } of results) {
    if (process.argv.includes('--write') && report.applied.length) {
      const json = JSON.stringify(rows, null, 2).replace(/[\u007f-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
      fs.writeFileSync(path.join(root, file), json + '\n');
    }
    console.log(JSON.stringify({ file, write: process.argv.includes('--write'), ...report }));
  }
}
module.exports = { importStatuses };
