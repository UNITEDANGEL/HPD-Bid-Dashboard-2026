// Where a job stands, in one line of six steps: Awarded -> Tenant -> Work done -> Paperwork sent -> HPD closed ->
// Paid. (Tenant added 23 Oct: texted / replied / appointment set.) From the job (award, field outcome and dates, package approved / emailed, paperwork found in Sent
// mail, HPD's closing reason), HPD's rejection notices and PIP's paid / not paid.

export type StageTone = "done" | "now" | "todo" | "bad";
export type Stage = { key: "awarded" | "tenant" | "work" | "paperwork" | "closed" | "paid"; label: string; detail: string; tone: StageTone };
export type StagePip = { status: string; paid: number; outstanding: number; closed: boolean };
export type StageRejection = { at: string; reason: string; answered: boolean; pay: string };

const s = (v: unknown) => String(v ?? "").trim();
const OUTCOME_LABEL: Record<string, string> = {
  WORK_COMPLETED: "Work done", PARTIAL_WORK_COMPLETED: "Partial work", REFUSED_ACCESS: "Refused access",
  COMPLETED_BY_OTHERS: "Done by others", NO_ACCESS_2_COMPLETE: "No access (2nd try)", NO_ACCESS_1_WAITING_72H: "No access (1st try)",
};
const CLOSED_OUTCOME = /WORK_COMPLETED|PARTIAL|REFUSED|COMPLETED_BY_OTHERS|NO_ACCESS_2/;

// "10/14/26", "2026-10-14", ISO time -> "10/14/26"
export function shortDay(value: unknown) {
  const v = s(value);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v);
  return m ? `${Number(m[1])}/${Number(m[2])}/${m[3].slice(-2)}` : "";
}

export function jobStages(job: Record<string, unknown>, pip?: StagePip | null, rejection?: StageRejection | null): Stage[] {
  const outcome = s(job.FieldOutcome || job.WorkflowStatus).toUpperCase();
  const hpdReason = s(job.HpdClosedReason);
  const workDay = shortDay(job.ActualWorkCompletionDate || job.NoAccessSecondAttemptAt || job.RefusalDate || job.VerifiedByOthersDate)
    || shortDay((Array.isArray(job.FieldVisitHistory) ? (job.FieldVisitHistory as Record<string, unknown>[]).at(-1)?.recordedAt : "") || "");
  const sentDay = shortDay(job.PackageEmailedAt || job.PackageApprovedAt) || shortDay(job.PaperworkSentAt);

  // A date entered after the paperwork went out is when it was recorded, not when the work was done.
  const ymd = (d: string) => { const [m, dd, y] = d.split("/").map(Number); return y * 10000 + m * 100 + dd; };
  const workNote = workDay && sentDay && ymd(workDay) > ymd(sentDay) ? `recorded ${workDay}` : workDay;

  const awarded: Stage = { key: "awarded", label: "Awarded", detail: shortDay(job.AwardDate) || "date not read", tone: "done" };

  let work: Stage;
  if (CLOSED_OUTCOME.test(outcome)) work = { key: "work", label: OUTCOME_LABEL[outcome] || "Work done", detail: workNote, tone: "done" };
  else if (hpdReason) work = { key: "work", label: "Done", detail: `HPD: ${hpdReason}`, tone: "done" };
  else if (outcome) work = { key: "work", label: OUTCOME_LABEL[outcome] || outcome.replace(/_/g, " ").toLowerCase(), detail: workDay, tone: "now" };
  else work = { key: "work", label: "Work done", detail: `complete by ${shortDay(job.WorkCompletionDate || job.MaturityDate) || "?"}`, tone: "todo" };

  let paperwork: Stage;
  if (rejection && !rejection.answered && rejection.pay !== "paid") paperwork = { key: "paperwork", label: "Rejected", detail: `${shortDay(rejection.at)}: ${rejection.reason}`.slice(0, 90), tone: "bad" };
  else if (sentDay) paperwork = { key: "paperwork", label: "Papers sent", detail: sentDay, tone: "done" };
  else paperwork = { key: "paperwork", label: "Papers", detail: "not sent yet", tone: work.tone === "done" ? "now" : "todo" };

  const closed: Stage = hpdReason
    ? { key: "closed", label: "HPD closed", detail: hpdReason, tone: "done" }
    : { key: "closed", label: "HPD closed", detail: sentDay ? "waiting on HPD" : "still open", tone: sentDay ? "now" : "todo" };

  let paid: Stage;
  if (pip?.status === "paid") paid = { key: "paid", label: "Paid", detail: `$${pip.paid.toLocaleString()}`, tone: "done" };
  else if (pip && pip.paid > 0) paid = { key: "paid", label: "Partly paid", detail: `$${pip.paid.toLocaleString()}, $${pip.outstanding.toLocaleString()} open`, tone: "now" };
  else if (pip && pip.outstanding > 0) paid = { key: "paid", label: "Not paid", detail: `$${pip.outstanding.toLocaleString()} open`, tone: hpdReason ? "now" : "todo" };
  else if (pip && pip.closed) paid = { key: "paid", label: "Not paid", detail: "closed with $0", tone: "bad" };
  else paid = { key: "paid", label: "Paid", detail: "not in PIP yet", tone: "todo" };

  // The tenant: a time to come (texted -> replied -> appointment). Done once there's an appointment or the work is done.
  const appt = job.Appointment as { date?: string; start?: string; state?: string } | undefined;
  const hasAppt = Boolean(appt && ["requested", "confirmed"].includes(String(appt.state)) && appt.date);
  let tenant: Stage;
  if (work.tone === "done" || work.tone === "now") tenant = { key: "tenant", label: "Tenant", detail: hasAppt ? `appt ${shortDay(appt!.date)}` : "reached", tone: "done" };
  else if (hasAppt) tenant = { key: "tenant", label: "Appointment", detail: `${shortDay(appt!.date)} ${s(appt!.start)}`.trim(), tone: "done" };
  else if (s(job.TenantRepliedAt)) tenant = { key: "tenant", label: "Tenant replied", detail: `${shortDay(job.TenantRepliedAt)}: book a time`, tone: "now" };
  else if (s(job.TenantTextedAt)) tenant = { key: "tenant", label: "Tenant texted", detail: `${shortDay(job.TenantTextedAt)}, waiting`, tone: "now" };
  else tenant = { key: "tenant", label: "Tenant", detail: "text for a time", tone: "todo" };

  return [awarded, tenant, work, paperwork, closed, paid];
}

// The one thing to do next (the first step that isn't done).
export function nextStep(stages: Stage[]) {
  const st = stages.find((x) => x.tone !== "done");
  if (!st) return "All done: paid.";
  if (st.tone === "bad" && st.key === "paperwork") return "Fix and resend the rejected paperwork.";
  if (st.tone === "bad" && st.key === "paid") return "HPD closed it with $0 paid: dispute it with HPD.";
  if (st.key === "tenant") return st.tone === "now" && /replied/i.test(st.label) ? "Call the tenant and set the appointment." : st.tone === "now" ? "Waiting for the tenant to answer (call after a day)." : "Text the tenant for a day and time.";
  return ({ awarded: "Check the award.", work: "Do the work (or record the visit).", paperwork: "Send the paperwork to HPD.", closed: "Waiting for HPD to close it.", paid: "Waiting for payment (check PIP)." } as const)[st.key];
}
