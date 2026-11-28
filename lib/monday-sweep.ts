// 🔁 Monday paperwork sweep (plan item 32): Monday morning, once, in the brief: the jobs finished in the field whose
// paperwork hasn't gone to HPD yet, oldest first, so nothing finished sits unpaid.

type Job = Record<string, unknown>;
const FINISHED = /WORK_COMPLETED|PARTIAL_WORK|REFUSED_ACCESS|NO_ACCESS_2|COMPLETED_BY_OTHERS/;
const t = (v: unknown) => { const n = Date.parse(String(v || "")); return Number.isFinite(n) ? n : 0; };

export function paperworkLeft(jobs: Job[], sent: Record<string, { sentAt?: string }> = {}) {
  return jobs.filter((j) => {
    const id = String(j.OMO || j.id || "");
    if (!id || /^TEST/i.test(id)) return false;
    if (!FINISHED.test(String(j.FieldOutcome || j.fieldOutcome || ""))) return false;
    if (j.PaperworkSentAt || j.PackageApprovedAt || sent[id]?.sentAt) return false;
    return !/archived/i.test(String(j.status || j.StatusOverride || "")) && !j.ArchivedFromMap;
  }).map((j) => ({ id: String(j.OMO || j.id), at: t(j.OutcomeLockedAt || j.outcomeLockedAt || j.LastFieldVisitAt) }))
    .sort((a, b) => (a.at || Infinity) - (b.at || Infinity));
}

// "Monday sweep: 3 finished jobs still need their paperwork sent, oldest first: ER01234, ER05678 and EQ11111."
export function mondaySweepLine(left: { id: string }[]) {
  if (!left.length) return "";
  const ids = left.slice(0, 4).map((x) => x.id);
  const list = ids.length > 1 ? `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}` : ids[0];
  return `Monday sweep: ${left.length} finished job${left.length === 1 ? "" : "s"} still need${left.length === 1 ? "s" : ""} the paperwork sent, oldest first: ${list}${left.length > 4 ? `, and ${left.length - 4} more` : ""}.`;
}

// Monday from 8 AM (New York).
export const isMondaySweepTime = (weekday: number, hour: number) => weekday === 1 && hour >= 8;

// 🏁 Work done, send it (plan item 37, 24 Nov): the awarded jobs where the work is marked done (work completed or
// partial work, from the job or the step saved in the app) but the paperwork isn't sent to HPD yet and HPD hasn't
// closed them, oldest first (by the work date). OMO numbers and dates only.
export type DoneToSend = { omo: string; outcome: string; at: string; days: number | null };
const WORK_DONE = /^(WORK_COMPLETED|PARTIAL_WORK)$/;
const dayKey = (v: unknown) => {
  const x = String(v || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(x);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const n = Date.parse(x);
  return Number.isFinite(n) ? new Date(n).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
};
export function workDoneToSend(opts: { jobs: Job[]; overrides?: Record<string, Job> | null; sent?: Record<string, unknown> | null; closed?: Record<string, unknown> | null; today: string }): DoneToSend[] {
  const seen = new Set<string>();
  const out: DoneToSend[] = [];
  const now = Date.parse(`${opts.today}T12:00:00Z`);
  const ids = [...(opts.jobs || []).map((j) => String(j.OMO || j.id || "").trim().toUpperCase())];
  const byId = new Map<string, Job>();
  (opts.jobs || []).forEach((j, i) => { if (ids[i] && !byId.has(ids[i])) byId.set(ids[i], j); });
  for (const [omo, base] of byId) {
    if (/^TEST/i.test(omo) || seen.has(omo)) continue;
    seen.add(omo);
    const j: Job = { ...base, ...(opts.overrides?.[omo] || {}) };
    const outcome = String(j.FieldOutcome || j.fieldOutcome || j.WorkflowStatus || "").trim().toUpperCase();
    if (!WORK_DONE.test(outcome)) continue;
    if (opts.sent?.[omo] || opts.closed?.[omo] || j.PaperworkSentAt || j.PackageEmailedAt || j.InvoiceSentAt || j.HpdClosedReason) continue;
    if (/archived/i.test(String(j.status || j.StatusOverride || "")) || j.ArchivedFromMap || j.ArchivedAt) continue;
    const at = dayKey(j.ActualWorkCompletionDate || j.OutcomeLockedAt || j.outcomeLockedAt || j.LastFieldVisitAt || j.OnSiteEndedAt);
    const d = at ? Date.parse(`${at}T12:00:00Z`) : NaN;
    out.push({ omo, outcome, at, days: Number.isFinite(d) && Number.isFinite(now) ? Math.max(0, Math.round((now - d) / 86400000)) : null });
  }
  return out.sort((a, b) => (a.at || "9999").localeCompare(b.at || "9999") || a.omo.localeCompare(b.omo));
}

// 🏁 Work done, not sent: evening alert (plan item 50, 27 Nov): awarded jobs whose work is done (marked work completed /
// partial work, or After photos saved on the job) 2+ days ago and whose paperwork still isn't sent to HPD. The After
// photo time is AfterPhotoAt, or the last time the worker's photos arrived (WorkerNewAt, stamped on every upload, so
// After photos are at least that old). OMO numbers and days only (the alert is not private).
export const DONE_NOT_SENT_DAYS = 2;
export function doneNotSent(opts: { awards: Job[] | null | undefined; overrides?: Record<string, Job> | null; sent?: Record<string, unknown> | null; closed?: Record<string, unknown> | null; today: string; now?: number }): { omo: string; days: number }[] {
  const jobs = (opts.awards || []).filter((a) => String(a.OMO || a.id || "").trim());
  const out = new Map<string, number>();
  for (const d of workDoneToSend({ jobs, overrides: opts.overrides, sent: opts.sent, closed: opts.closed, today: opts.today })) {
    if (d.days !== null && d.days >= DONE_NOT_SENT_DAYS) out.set(d.omo, d.days);
  }
  const now = opts.now ?? Date.parse(`${opts.today}T12:00:00Z`);
  for (const a of jobs) {
    const omo = String(a.OMO || a.id || "").trim().toUpperCase();
    if (/^TEST/i.test(omo) || out.has(omo)) continue;
    const j: Job = { ...a, ...(opts.overrides?.[omo] || {}) };
    if (!(Number(j.AfterPhotoCount) > 0)) continue;
    if (opts.sent?.[omo] || opts.closed?.[omo] || j.PaperworkSentAt || j.PackageEmailedAt || j.InvoiceSentAt || j.HpdClosedReason) continue;
    if (/archived/i.test(String(j.status || j.StatusOverride || "")) || j.ArchivedFromMap || j.ArchivedAt) continue;
    const t = Date.parse(String(j.AfterPhotoAt || j.WorkerNewAt || ""));
    if (!Number.isFinite(t)) continue;
    const days = Math.floor((now - t) / 86400000);
    if (days >= DONE_NOT_SENT_DAYS) out.set(omo, days);
  }
  return [...out].map(([omo, days]) => ({ omo, days })).sort((a, b) => b.days - a.days || a.omo.localeCompare(b.omo));
}
