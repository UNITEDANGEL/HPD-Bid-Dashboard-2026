type Job = Record<string, unknown>;

export const JOB_QUEUES = [
  { key: "pending", label: "Pending" },
  { key: "followup", label: "Follow-up" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archive" },
  { key: "all", label: "All jobs" },
];

export function savedJobStatus(job: Job): string {
  return String(["WorkflowStatus", "workflowStatus", "FieldOutcome", "fieldOutcome", "StatusOverride", "status", "Status", "JobStatus"]
    .map(key => job[key]).find(value => value !== undefined && value !== null && String(value).trim()) || "Pending");
}

export function jobQueue(job: Job): string {
  const status = savedJobStatus(job).toLowerCase().replace(/[_-]+/g, " ");
  if ([job.archived, job.Archived, job.ArchivedFromMap, job.archivedFromMap].some(value => value === true || value === 1 || /^(true|1)$/i.test(String(value))) || /\barchived\b/.test(status)) return "archived";
  if (/no access|refused|partial|appointment|scheduled|not completed|incomplete/.test(status)) return "followup";
  if (/\b(completed|complete|closed|cancelled|canceled)\b/.test(status)) return "completed";
  return "pending";
}

export function matchesJobQueue(job: Job, queue: string): boolean {
  return queue === "all" || jobQueue(job) === queue;
}
