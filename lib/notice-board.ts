// The 24 / 72-hour notice board (owner, 17 Oct 2026): every poor performance notice from vendor tracking, followed to
// the end in four steps: reply sent -> paperwork made -> sent to vendor tracking -> confirmed. Steps tick by
// themselves from the emails (our reply in the thread, our email with the PDFs, their answer after it), from the
// paperwork on record, or by the owner's tap. A notice drops to "Done" once confirmed (or HPD closed / PIP paid).

export type BoardMessage = { at: string; text: string; hpd: boolean; mine: boolean; files?: string[] };
export type BoardThread = { id: string; subject: string; omos: string[]; people: string[]; messages: BoardMessage[] };
export type BoardStep = "replied" | "made" | "sent" | "confirmed";
export type BoardMarks = Record<string, Partial<Record<BoardStep, string>>>; // row key -> step -> when the owner ticked it
export const BOARD_STEPS: { key: BoardStep; label: string; icon: string }[] = [
  { key: "replied", label: "Reply sent", icon: "✉" },
  { key: "made", label: "Paperwork made", icon: "📄" },
  { key: "sent", label: "Sent to vendor tracking", icon: "📤" },
  { key: "confirmed", label: "Confirmed", icon: "✅" },
];

export type BoardRow = {
  key: string; omo: string; threadId: string; subject: string;
  hours: 24 | 72; who: string; to: string;   // who sent the notice and their @hpd.nyc.gov address
  noticeAt: string; dueAt: string;
  steps: Record<BoardStep, { done: boolean; at: string; how: "email" | "record" | "tap" | "" }>;
  next: BoardStep | null;                     // the first step not done (null: done)
  sentAt: string;                             // paperwork on record for the job (sent_paperwork.json)
  noticeText: string;                         // their notice (for the AI-written reply)
};

const PPN = /poor performance|performance notice|\bPPN\b/i;
const HPD_EMAIL = /([a-z0-9._%+-]+@hpd\.nyc\.gov)/i;

export function buildBoard(input: {
  threads: BoardThread[];
  sent: Record<string, { sentAt?: string }>;
  marks: BoardMarks;
  closed?: Set<string>;
  now?: number;
  days?: number; // how far back (default 30)
}): BoardRow[] {
  const now = input.now ?? Date.now();
  const days = input.days ?? 30;
  const closed = input.closed || new Set<string>();
  const rows: BoardRow[] = [];
  const seen = new Set<string>();
  for (const t of input.threads) {
    if (!PPN.test(t.subject)) continue;
    const omo = t.omos[0];
    if (!omo) continue;
    const msgs = [...t.messages].sort((a, b) => a.at.localeCompare(b.at));
    const notice = msgs.find((m) => m.hpd && !m.mine);
    if (!notice || now - Date.parse(notice.at) > days * 86400000) continue;
    const key = `${omo}:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hours: 24 | 72 = /\b24\s*-?\s*(HR|HOUR)/i.test(t.subject) && !/\b72\s*-?\s*(HR|HOUR)/i.test(t.subject) ? 24 : /\b72/.test(t.subject) ? 72 : 24;
    const after = msgs.filter((m) => m.at > notice.at);
    const reply = after.find((m) => m.mine);
    const withFiles = after.find((m) => m.mine && (m.files?.length || 0) > 0);
    const lastMine = [...after].reverse().find((m) => m.mine && (m.files?.length || 0) > 0);
    const answer = lastMine ? after.find((m) => m.hpd && !m.mine && m.at > lastMine.at) : undefined;
    const mark = input.marks[key] || {};
    const sentAt = input.sent[omo]?.sentAt || "";
    const step = (email: string, record: string, tap: string | undefined) =>
      email ? { done: true, at: email, how: "email" as const } : record ? { done: true, at: record, how: "record" as const } : tap ? { done: true, at: tap, how: "tap" as const } : { done: false, at: "", how: "" as const };
    const steps: BoardRow["steps"] = {
      replied: step(reply?.at || "", "", mark.replied),
      made: step(withFiles?.at || "", sentAt, mark.made),
      sent: step(withFiles?.at || "", "", mark.sent),
      confirmed: step(answer?.at || "", closed.has(omo) ? "closed" : "", mark.confirmed),
    };
    // A later step done means the earlier ones are too (e.g. the paperwork went out with the reply).
    if (steps.sent.done && !steps.replied.done) steps.replied = { ...steps.sent };
    if (steps.confirmed.done) for (const k of ["replied", "made", "sent"] as BoardStep[]) if (!steps[k].done) steps[k] = { done: true, at: steps.confirmed.at, how: steps.confirmed.how };
    const to = (msgs.filter((m) => m.hpd && !m.mine).map((m) => (HPD_EMAIL.exec(m.text) || [])[1]).find(Boolean) || "").toLowerCase();
    rows.push({
      key, omo, threadId: t.id, subject: t.subject, hours, who: t.people[0] || "Vendor tracking", to,
      noticeAt: notice.at, dueAt: new Date(Date.parse(notice.at) + hours * 3600000).toISOString(),
      steps, next: BOARD_STEPS.find((s) => !steps[s.key].done)?.key ?? null, sentAt, noticeText: notice.text.slice(0, 2500),
    });
  }
  // Still to do first (the nearest deadline first), then sent and waiting on them, then done (newest first).
  const rank = (r: BoardRow) => (!r.next ? 2 : r.steps.sent.done ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || (a.next ? Date.parse(a.dueAt) - Date.parse(b.dueAt) : Date.parse(b.noticeAt) - Date.parse(a.noticeAt)));
}

// Hours left before the deadline (negative: overdue).
export function hoursLeft(row: BoardRow, now = Date.now()) {
  return (Date.parse(row.dueAt) - now) / 3600000;
}

// Open notices with under 6 hours left (or overdue) and nothing sent yet: the reminder.
export function urgentRows(rows: BoardRow[], now = Date.now()) {
  return rows.filter((r) => r.next && !r.steps.sent.done && hoursLeft(r, now) < 6);
}

// A ready reply for the owner to check (never sent without the owner's taps): what we have and what comes next.
export function draftReply(row: BoardRow, address: string) {
  const first = (row.who || "").split(/\s+/)[0] || "";
  const sentDate = row.sentAt ? new Date(`${row.sentAt}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "";
  const body = row.steps.sent.done || row.sentAt
    ? `The affidavit and invoice for this job ${row.sentAt ? `were sent on ${sentDate}` : "were sent"}. Please let us know if you did not receive them or need anything else.`
    : row.steps.made.done
      ? "The affidavit and invoice for this job are ready and will be sent to you today."
      : "We received your notice. We are on it and will send the affidavit and invoice (or an update on the job) within the deadline.";
  return {
    subject: `RE: ${row.subject}`.slice(0, 200),
    text: `Hello${first ? ` ${first}` : ""},\n\nRe: OMO# ${row.omo}${address ? ` - ${address}` : ""}\n\n${body}\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`,
  };
}
