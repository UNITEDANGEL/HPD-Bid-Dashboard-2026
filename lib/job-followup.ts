// Job follow-up: where each job really stands, and what to chase.
// A job's status comes from what the app recorded in the field; when the app has nothing, from what you
// sent HPD (affidavit / invoice emails, scripts/fetch_sent_paperwork.py) and HPD's own closing reason
// (NYC Open Data, scripts/update-hpd-job-status.mjs). Shown only: the job's saved record isn't changed.
// The maturity date is the job's work completion date; open jobs past it are overdue.

export type HpdJobStatus = { closedReason: string; amount?: number };
export type SentPaperwork = { sentAt: string; count: number };
// HPD staff asking for affidavits / invoices / photos / status (scripts/fetch_hpd_requests.py).
// askedTs / repliedTs: exact times of HPD's last request and your last email to HPD staff about the job.
export type HpdRequest = { askedAt: string; count: number; by?: string; kind?: string; askedTs?: number; repliedTs?: number;
  // HPD rejected the payment paperwork ("deemed unacceptable", "Rejections"): when, who, why.
  rejectedTs?: number; rejectedAt?: string; rejectedBy?: string; rejectedReason?: string; rejectedAttempt?: string; rejectedCount?: number };
export type Recovered = { kind: "complete" | "noaccess" | "refused" | "others" | "partial" | "closed" | "sent"; label: string; hpdReason: string; sentAt: string };

const CLOSING = /WORK_COMPLETED|REFUSED_ACCESS|NO_ACCESS_COMPLETE|NO_ACCESS_2|BY_OTHERS|PARTIAL_WORK_COMPLETED/i;

export function appOutcome(job: Record<string, unknown>) {
  return String(job.FieldOutcome || job.fieldOutcome || "").trim();
}

export function appClosed(job: Record<string, unknown>) {
  return CLOSING.test(appOutcome(job));
}

function kindOf(reason: string): Recovered["kind"] {
  if (/refus/i.test(reason)) return "refused";
  if (/no access/i.test(reason)) return "noaccess";
  if (/landlord complied|owner complied/i.test(reason)) return "others";
  if (/partial/i.test(reason)) return "partial";
  if (/omo completed|completed/i.test(reason)) return "complete";
  return "closed";
}

// Status for a job the app has no closing status for: HPD's reason, and when you sent the paperwork.
export function recoveredStatus(job: Record<string, unknown>, hpd: HpdJobStatus | undefined, sent: SentPaperwork | undefined): Recovered | null {
  if (appClosed(job)) return null;
  const reason = hpd?.closedReason || "";
  if (!reason && !sent) return null;
  const kind = reason ? kindOf(reason) : "sent";
  const labels: Record<Recovered["kind"], string> = {
    complete: "Completed (HPD closed)", noaccess: "No access (HPD closed)", refused: "Refused access (HPD closed)",
    others: "Landlord complied (HPD closed)", partial: "Partial work (HPD closed)", closed: `HPD closed: ${reason}`,
    sent: "Paperwork sent to HPD",
  };
  return { kind, label: labels[kind], hpdReason: reason, sentAt: sent?.sentAt || "" };
}

function day(value: unknown) {
  const s = String(value || "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export type FollowUp = {
  omo: string; address: string;
  awardDay: string; startDay: string; maturityDay: string;
  daysLeft: number | null; // to the maturity date (negative = overdue)
  // done: closed in the app · hpd-closed: HPD closed it (app never recorded) · sent: you sent HPD the
  // paperwork, HPD hasn't closed it yet (follow up with HPD, no visit) · overdue / due-week / open: no
  // status and no paperwork: work still to do.
  state: "done" | "hpd-closed" | "sent" | "overdue" | "due-week" | "open";
  status: string; // what to show
  hpdReason: string; sentAt: string;
  askedAt: string; // last time HPD staff emailed asking about this job
  askedBy: string; askedFor: string; // who (e.g. "J. Lewis") and what ("resubmit", "photos / videos", ...)
  hpdAsked: boolean; // HPD asked and nothing was sent since: send the paperwork first
};

export function followUpOf(job: Record<string, unknown>, hpd: HpdJobStatus | undefined, sent: SentPaperwork | undefined, today: string, asked?: HpdRequest): FollowUp {
  const omo = String(job.OMO || job.id || "");
  const awardDay = day(job.AwardDate || job.awardDate);
  const startDay = day(job.WorkStartDate || job.workStartDate);
  const maturityDay = day(job.MaturityDate || job.maturityDate || job.WorkCompletionDate || job.workCompletionDate);
  const daysLeft = maturityDay ? daysBetween(today, maturityDay) : null;
  const rec = recoveredStatus(job, hpd, sent);
  const closedInApp = appClosed(job);
  const state: FollowUp["state"] = closedInApp ? "done" : rec && rec.kind !== "sent" ? "hpd-closed" : rec?.kind === "sent" ? "sent"
    : daysLeft !== null && daysLeft < 0 ? "overdue" : daysLeft !== null && daysLeft <= 7 ? "due-week" : "open";
  const status = closedInApp ? appOutcome(job).replace(/_/g, " ").toLowerCase() : rec ? rec.label : appOutcome(job) ? appOutcome(job).replace(/_/g, " ").toLowerCase() : "no status yet";
  const sentAt = sent?.sentAt || rec?.sentAt || "";
  const askedAt = asked?.askedAt || "";
  // HPD wrote last: their request is newer than your last email to them about it (exact times when known,
  // otherwise newer than the day the paperwork went out).
  const answered = asked?.askedTs && asked.repliedTs ? asked.repliedTs > asked.askedTs : !!sentAt && askedAt <= sentAt;
  const hpdAsked = !!askedAt && state !== "done" && state !== "hpd-closed" && !answered;
  return { omo, address: String(job.BuildingAddress || job.address || ""), awardDay, startDay, maturityDay, daysLeft, state, status, hpdReason: hpd?.closedReason || "", sentAt, askedAt, askedBy: asked?.by || "", askedFor: asked?.kind || "", hpdAsked };
}

// The daily follow-up report: awarded in the last 30 days, overdue (open at HPD and in the app, past the
// maturity date), due this week, and jobs HPD closed that the app never recorded.
export function followUpReport(jobs: Record<string, unknown>[], hpd: Record<string, HpdJobStatus>, sent: Record<string, SentPaperwork>, today: string, asked: Record<string, HpdRequest> = {}) {
  const rows = jobs
    .filter((j) => String(j.OMO || "").toUpperCase() !== "TEST-0001")
    .map((j) => followUpOf(j, hpd[String(j.OMO)], sent[String(j.OMO)], today, asked[String(j.OMO)]));
  const recent = rows.filter((r) => r.awardDay && daysBetween(r.awardDay, today) <= 30 && daysBetween(r.awardDay, today) >= 0)
    .sort((a, b) => b.awardDay.localeCompare(a.awardDay));
  // Most recently overdue first (still fresh: do it now); a job 200 days overdue goes to the bottom.
  const overdue = rows.filter((r) => r.state === "overdue").sort((a, b) => (b.daysLeft ?? 0) - (a.daysLeft ?? 0));
  // HPD asked for paperwork and nothing was sent since: first thing to do, newest request first.
  const hpdAsked = rows.filter((r) => r.hpdAsked).sort((a, b) => b.askedAt.localeCompare(a.askedAt));
  const dueWeek = rows.filter((r) => r.state === "due-week").sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const hpdClosed = rows.filter((r) => r.state === "hpd-closed");
  const waitingOnHpd = rows.filter((r) => r.state === "sent").sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return {
    rows, recent, overdue, dueWeek, hpdClosed, waitingOnHpd, hpdAsked,
    counts: { hpdAsked: hpdAsked.length, total: rows.length, done: rows.filter((r) => r.state === "done").length, hpdClosed: hpdClosed.length, waitingOnHpd: waitingOnHpd.length, overdue: overdue.length, dueWeek: dueWeek.length, recent: recent.length },
  };
}

// Payment paperwork HPD rejected and you haven't answered since (your last email to HPD staff about the job
// is older than the rejection). Every OMO, including older jobs that aren't on the map. Newest first.
export type Rejection = { omo: string; at: string; by: string; reason: string; attempt: string; count: number; answered: boolean; address: string; onMap: boolean };
export function paperworkRejections(asked: Record<string, HpdRequest>, jobs: Record<string, unknown>[]) {
  const byOmo = new Map(jobs.map((j) => [String(j.OMO || j.id || "").toUpperCase(), j]));
  const rows: Rejection[] = [];
  for (const [omo, r] of Object.entries(asked)) {
    if (!r.rejectedTs) continue;
    const job = byOmo.get(omo.toUpperCase());
    rows.push({ omo, at: r.rejectedAt || "", by: r.rejectedBy || "HPD", reason: r.rejectedReason || "", attempt: r.rejectedAttempt || "", count: r.rejectedCount || 1,
      answered: !!r.repliedTs && r.repliedTs > r.rejectedTs, address: String(job?.BuildingAddress || job?.address || ""), onMap: !!job });
  }
  return rows.sort((a, b) => Number(a.answered) - Number(b.answered) || Number(b.attempt === "FINAL") - Number(a.attempt === "FINAL") || b.at.localeCompare(a.at));
}
