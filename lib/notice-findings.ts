// A head start on every notice from vendor tracking (owner, 18 Oct 2026): what the app already has for that job, with
// dates (paperwork sent, the outcome, visits, HPD's status, PIP, a rejection), and what to do next. Only facts on record.

export type Finding = { icon: string; text: string; tone: "good" | "bad" | "info" };
export type FindingAdvice = { text: string; action: "resend" | "make" | "update" | "check"; outcome?: string };
export type NoticeFindings = { lines: Finding[]; advice: FindingAdvice };

type Rec = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const day = (v: unknown) => {
  const t = s(v);
  if (!t) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00`) : new Date(t);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) : "";
};
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const OUTCOMES: Record<string, { label: string; outcome: string; done: boolean }> = {
  WORK_COMPLETED: { label: "Work completed", outcome: "work_completed", done: true },
  COMPLETED: { label: "Work completed", outcome: "work_completed", done: true },
  PARTIAL_WORK_COMPLETED: { label: "Partly done", outcome: "partial_work_completed", done: false },
  REFUSED_ACCESS: { label: "Refused access", outcome: "refused_access", done: true },
  NO_ACCESS_COMPLETE: { label: "No access (2 tries)", outcome: "no_access", done: true },
  NO_ACCESS: { label: "No access", outcome: "no_access", done: false },
  NO_ACCESS_1: { label: "No access (1st try)", outcome: "no_access", done: false },
  COMPLETED_BY_OTHERS: { label: "Completed by others", outcome: "completed_by_others", done: true },
};

export function noticeFindings(input: {
  omo: string;
  job: Rec | null;
  sent?: { sentAt?: string; count?: number };
  hpd?: { closedReason?: string; amount?: number };
  pip?: { status: string; paid: number; outstanding: number; closed?: boolean };
  rejection?: { at: string; reason: string; answered: boolean } | null;
  ourFilesAt?: string;  // our email with PDFs in their thread, after the notice
  noticeAt?: string;
}): NoticeFindings {
  const j = input.job || {};
  const lines: Finding[] = [];
  // Paperwork.
  const sentAt = s(input.sent?.sentAt);
  if (sentAt) lines.push({ icon: "📄", text: `Affidavit & invoice sent to HPD on ${day(sentAt)}${input.sent?.count ? ` (${input.sent.count} files)` : ""}`, tone: "good" });
  const madeAt = s(j.PackageEmailedAt) || s(j.PackageApprovedAt) || s(j.PackageGeneratedAt);
  if (madeAt && !sentAt) lines.push({ icon: "📄", text: `Paperwork made in the app on ${day(madeAt)}`, tone: "good" });
  if (input.ourFilesAt) lines.push({ icon: "📤", text: `You emailed them PDFs on ${day(input.ourFilesAt)}`, tone: "good" });
  if (!sentAt && !madeAt && !input.ourFilesAt) lines.push({ icon: "⚠️", text: "No affidavit or invoice on record for this job", tone: "bad" });
  // What happened at the job.
  const code = s(j.FieldOutcome || j.WorkflowStatus).toUpperCase().replace(/[\s-]+/g, "_");
  const out = OUTCOMES[code];
  const outDay = day(j.ActualWorkCompletionDate || j.RefusalDate || j.NoAccessSecondAttemptAt || j.NoAccessFirstAttemptAt || j.VerifiedByOthersDate);
  if (out) {
    const tries = code.startsWith("NO_ACCESS") ? [day(j.NoAccessFirstAttemptAt), day(j.NoAccessSecondAttemptAt)].filter(Boolean).join(" and ") : "";
    lines.push({ icon: out.done ? "✅" : "🔁", text: `${out.label}${tries ? ` ${tries}` : outDay ? ` ${outDay}` : ""} (from your app)`, tone: out.done ? "good" : "info" });
  }
  const visits = Array.isArray(j.FieldVisitHistory) ? (j.FieldVisitHistory as Rec[]) : [];
  const realVisits = visits.filter((v) => !/on the way/i.test(s(v.note)));
  if (realVisits.length) lines.push({ icon: "📍", text: `${realVisits.length} visit${realVisits.length === 1 ? "" : "s"} recorded, last ${day(realVisits.at(-1)?.recordedAt)}`, tone: "info" });
  else if (!out) lines.push({ icon: "📍", text: "No visit or outcome recorded in the app", tone: "bad" });
  const due = day(j.WorkCompletionDate || j.MaturityDate);
  if (due && !out) lines.push({ icon: "📅", text: `Work was due by ${due}`, tone: "info" });
  // HPD and money.
  if (s(input.hpd?.closedReason)) lines.push({ icon: "🏛", text: `HPD closed it: ${s(input.hpd?.closedReason)}${input.hpd?.amount ? ` (${money(input.hpd.amount)})` : ""}`, tone: "info" });
  if (input.pip) lines.push({ icon: "💵", text: input.pip.status === "paid" ? `PIP: paid ${money(input.pip.paid)}` : input.pip.outstanding > 0 ? `PIP: not paid, ${money(input.pip.outstanding)} open` : input.pip.closed ? "PIP: closed with $0 paid" : `PIP: ${input.pip.status}`, tone: input.pip.status === "paid" ? "good" : "info" });
  if (input.rejection && !input.rejection.answered) lines.push({ icon: "❗", text: `Payment rejected ${day(input.rejection.at)}: ${input.rejection.reason.slice(0, 120)}`, tone: "bad" });

  // What to do next.
  let advice: FindingAdvice;
  if (input.pip?.status === "paid") advice = { text: "HPD already paid this job: tell them it's paid and closed (PIP).", action: "check" };
  else if (sentAt || input.ourFilesAt) advice = { text: `Paperwork went out ${day(input.ourFilesAt || sentAt)}: reply with that date and send it to them again.`, action: "resend" };
  else if (madeAt) advice = { text: "The paperwork is made but not sent: send it to them now.", action: "resend" };
  else if (out?.done) advice = { text: `${out.label}${outDay ? ` on ${outDay}` : ""}: make that affidavit and invoice, and send it.`, action: "make", outcome: out.outcome };
  else if (out || realVisits.length) advice = { text: "Started but not finished: send them an update (what's left and when you'll go back).", action: "update" };
  else advice = { text: "Nothing on record yet: send an update now (when you'll go), then do the job.", action: "update" };
  return { lines, advice };
}
