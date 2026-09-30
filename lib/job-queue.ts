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
  const visit = visitState(job);
  if (visit.blocked && visit.kind !== "finished") return "followup";
  if (visit.approved && visit.kind !== "finished" && !/appointment|scheduled/.test(status)) return "pending";
  if (/no access|refused|partial|appointment|scheduled|not completed|incomplete/.test(status)) return "followup";
  if (/\b(completed|complete|closed|cancelled|canceled)\b/.test(status)) return "completed";
  return "pending";
}

export function visitState(job: Job) {
  const normalized = (value: unknown) => String(value || "").toLowerCase().replace(/[_-]+/g, " ");
  const status = normalized(savedJobStatus(job));
  const history = (Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : []).filter(entry => entry && typeof entry === "object" && entry.outcome);
  const date = (value: unknown) => { const n = Date.parse(String(value || "")); return Number.isFinite(n) ? n : 0; };
  const day = (value: unknown) => date(value) ? new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York"}).format(new Date(date(value))) : "undated";
  const visits = new Set(history.map(entry => day(entry.recordedAt)));
  const noAccessDays = new Set(history.filter(entry => /no access/.test(normalized(entry.outcome))).map(entry => day(entry.recordedAt)));
  const explicitAttempts = /no access.*(2nd|second|complete|3rd|third)/.test(status) ? 2 : /no access/.test(status) || job.NoAccessFirstAttemptAt ? 1 : 0;
  const attempts = Math.max(noAccessDays.size, explicitAttempts);
  const refused = /refused/.test(status) || history.some(entry => /refused/.test(normalized(entry.outcome)));
  const latest = [...history].sort((a,b)=>date(b.recordedAt)-date(a.recordedAt))[0];
  const lastRaw = [latest?.recordedAt, job.LastFieldVisitAt, job.NoAccessFirstAttemptAt, job.RefusalDate].sort((a,b)=>date(b)-date(a))[0];
  const lastAt = date(lastRaw);
  const approved = date(job.RevisitApprovedAt) > 0 && date(job.RevisitApprovedAt) > lastAt;
  const finished = [job.archived,job.Archived,job.ArchivedFromMap,job.archivedFromMap].some(v=>v===true||v===1||/^(true|1)$/i.test(String(v))) || (!/partial|not completed|incomplete|no access/.test(status) && /completed|complete|closed|archived|cancelled|canceled/.test(status));
  const blocked = finished || (!approved && (refused || attempts >= 2));
  const waiting = !approved && (attempts > 0 || /appointment|scheduled/.test(status));
  const kind = finished ? "finished" : blocked ? "blocked" : waiting ? "return" : "needs";
  return { kind, blocked, approved, attempts, count: Math.max(visits.size,attempts,refused || lastAt ? 1 : 0), lastAt: lastAt ? (/^\d{4}-\d{2}-\d{2}$/.test(String(lastRaw)) ? String(lastRaw) : new Date(lastAt).toISOString()) : "", lastOutcome: String(latest?.outcome || savedJobStatus(job)), note: String(latest?.note || ""), color: kind === "finished" ? "#737b85" : blocked ? "#d93838" : waiting ? "#bd780b" : "#198754", label: finished ? "Finished / archived" : blocked ? "Do not revisit" : approved ? "Return approved" : waiting ? "Return needs review" : "Needs visit" };
}

export function matchesJobQueue(job: Job, queue: string): boolean {
  return queue === "all" || jobQueue(job) === queue;
}
