type Job = Record<string, unknown>;

export function calendarDay(raw: string): number | null {
  const iso = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!iso && !us) return null;
  const year = iso ? Number(iso[1]) : Number(us![3]) + (us![3].length === 2 ? 2000 : 0);
  const month = Number(iso ? iso[2] : us![1]);
  const day = Number(iso ? iso[3] : us![2]);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() / 86400000 : null;
}

export function maturityDate(job: Job): string {
  // WorkCompletionDate is the contractual completion date extracted from the COA.
  // ActualWorkCompletionDate is a fieldwork outcome and must never replace it.
  for (const key of ["MaturityDate", "maturityDate", "DueDate", "dueDate", "WorkCompletionDate", "workCompletionDate", "Work Completion Date"]) {
    if (job[key] !== undefined && job[key] !== null) return String(job[key]).trim();
  }
  return "";
}

export function isPendingJob(job: Job): boolean {
  if ([job.archived, job.Archived].some((v) => v === true || v === 1 || String(v).toLowerCase() === "true")) return false;
  const status = ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status", "JobStatus"].map((k) => job[k]).find((v) => v !== undefined && v !== null && String(v).trim());
  const normalized = String(status || "").toLowerCase().replace(/[_-]+/g, " ");
  if (/partial|not completed|incomplete/.test(normalized)) return true;
  return !/\b(completed|complete|closed|archived|cancelled|canceled)\b/.test(normalized);
}

export function jobPriority(job: Job, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value || "";
  const today = calendarDay(`${part("year")}-${part("month")}-${part("day")}`);
  const raw = maturityDate(job);
  const due = calendarDay(raw);
  const pending = isPendingJob(job);
  const days = due === null || today === null || !pending ? null : today - due;
  const band = !pending ? "closed" : days === null ? "unknown" : days > 150 ? "150+" : days > 90 ? "91-150" : days > 60 ? "61-90" : days > 30 ? "31-60" : days > 0 ? "1-30" : days === 0 ? "today" : "upcoming";
  const label = !pending ? "Closed job" : days === null ? (raw ? "Maturity date invalid" : "Maturity date missing") : days > 0 ? `${days} days overdue` : days === 0 ? "Due today" : `Due in ${-days} days`;
  return { days, band, label, raw, pending };
}
