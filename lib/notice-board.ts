// The vendor tracking board (owner, 17 Oct 2026): every poor performance notice (24 / 72 hours) and every job on a
// missing-documents list from vendor tracking, followed to the end in four steps: reply sent -> paperwork made ->
// sent to vendor tracking -> confirmed. Steps tick by themselves from the emails (our reply in the thread, our email
// with the PDFs, their answer after it), from the paperwork on record, or by the owner's tap. A job drops to "Done"
// once confirmed (or HPD closed / PIP paid).

import { dueAfterWeekdays } from "./business-days";

export type BoardMessage = { at: string; text: string; hpd: boolean; mine: boolean; files?: string[] };
export type BoardThread = { id: string; subject: string; omos: string[]; people: string[]; kind?: string; messages: BoardMessage[] };
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
  kind: "ppn" | "docs";                       // poor performance notice / missing-documents list
  hours: 24 | 72 | 0;                         // 0: no deadline (missing documents)
  who: string; to: string;                    // who sent it and their @hpd.nyc.gov address
  noticeAt: string; dueAt: string;            // dueAt "" when there's no deadline
  followUpAt: string;                         // their latest follow-up on the list ("" if none)
  want: string;                               // what they asked for ("Affidavit and Invoice", "photos"...)
  steps: Record<BoardStep, { done: boolean; at: string; how: "email" | "record" | "tap" | "" }>;
  next: BoardStep | null;                     // the first step not done (null: done)
  sentAt: string;                             // paperwork on record for the job (sent_paperwork.json)
  noticeText: string;                         // their notice (for the AI-written reply)
  lastMineAt: string;                         // our latest email on it (after their notice / list)
  lastTheirsAt: string;                       // their latest email after ours ("" if they haven't answered)
  filed: { at: string; name: string; here: boolean } | null; // our latest email with a PDF named for the job (any thread)
  generalOnly?: boolean;                      // the only answer was a note to the whole list ("I'll send them today")
};

// Where a row sits on the board (owner, 22 Oct: "once I hit send to vendor it should go to sent, waiting for a reply;
// the not-sent ones on one side, the sent ones on another"): nothing sent yet / sent and waiting / they replied / done.
export type BoardSide = "tosend" | "waiting" | "replied" | "done";
export function boardSide(row: BoardRow): BoardSide {
  if (!row.next) return "done";
  if (!row.steps.replied.done && !row.steps.sent.done) return "tosend";
  // A note to her whole list ("I'll send everything today") isn't this job sent: it stays to send until its PDF goes
  // out or an email names it.
  if (row.generalOnly && !row.steps.sent.done) return "tosend";
  return row.lastTheirsAt && Date.parse(row.lastTheirsAt) > sentTime(row) ? "replied" : "waiting";
}
// When we last sent them something (an email, or a send ticked by hand).
export function sentTime(row: BoardRow) {
  return Math.max(0, ...[row.lastMineAt, row.steps.replied.at, row.steps.sent.at].map((x) => Date.parse(x || "")).filter(Number.isFinite));
}

const PPN = /poor performance|performance notice|\bPPN\b/i;
const DOCS = /missing (required )?documents?/i;
const HPD_EMAIL = /([a-z0-9._%+-]+@hpd\.nyc\.gov)/i;
type Step = BoardRow["steps"][BoardStep];
const step = (email: string, record: string, tap: string | undefined): Step =>
  email ? { done: true, at: email, how: "email" } : record ? { done: true, at: record, how: "record" } : tap ? { done: true, at: tap, how: "tap" } : { done: false, at: "", how: "" };

export function buildBoard(input: {
  threads: BoardThread[];
  sent: Record<string, { sentAt?: string }>;
  marks: BoardMarks;
  closed?: Set<string>;
  now?: number;
  days?: number;     // how far back for notices (default 30)
  docsDays?: number; // how far back for missing-documents lists, by their latest message (default 31)
}): BoardRow[] {
  const now = input.now ?? Date.now();
  const days = input.days ?? 30;
  const docsDays = input.docsDays ?? 31;
  const closed = input.closed || new Set<string>();
  const rows: BoardRow[] = [];
  const seen = new Set<string>();
  // Every email of ours with an affidavit / invoice named for a job ("EO32701 AFF INVOICE.pdf"), in any thread (owner,
  // 22 Oct: "check the emails, AFF INVOICE is labeled with every OMO; I don't want to repeat what I've sent").
  const filedAll = new Map<string, { at: string; name: string; threadId: string }[]>();
  for (const t of input.threads) for (const m of t.messages) {
    if (!m.mine) continue;
    for (const f of m.files || []) {
      if (!/aff|inv/i.test(f)) continue;
      for (const o of new Set(f.toUpperCase().match(/[A-Z]{2}\d{5}/g) || [])) {
        const list = filedAll.get(o) || [];
        list.push({ at: m.at, name: f, threadId: t.id });
        filedAll.set(o, list);
      }
    }
  }
  const latestFiled = (omo: string, threadId: string, since = "") => {
    const list = (filedAll.get(omo) || []).filter((x) => !since || Date.parse(x.at) > Date.parse(since)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return list[0] ? { at: list[0].at, name: list[0].name, here: list[0].threadId === threadId } : null;
  };
  const namesJob = (m: BoardMessage, omo: string) => (m.files || []).some((f) => f.toUpperCase().includes(omo));
  const finish = (row: Omit<BoardRow, "next">) => {
    const s = row.steps;
    // A later step done means the earlier ones are too (e.g. the paperwork went out with the reply).
    if (s.sent.done && !s.replied.done) s.replied = { ...s.sent };
    if (s.sent.done && !s.made.done) s.made = { ...s.sent };
    if (s.confirmed.done) for (const k of ["replied", "made", "sent"] as BoardStep[]) if (!s[k].done) s[k] = { ...s.confirmed };
    rows.push({ ...row, next: BOARD_STEPS.find((b) => !s[b.key].done)?.key ?? null });
  };
  for (const t of input.threads) {
    const msgs = [...t.messages].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const theirs = msgs.filter((m) => m.hpd && !m.mine);
    if (!theirs.length) continue;
    const to = (theirs.map((m) => (HPD_EMAIL.exec(m.text) || [])[1]).find(Boolean) || "").toLowerCase();
    const who = t.people[0] || "Vendor tracking";
    if (PPN.test(t.subject)) {
      const omo = t.omos[0];
      const notice = theirs[0];
      if (!omo || now - Date.parse(notice.at) > days * 86400000) continue;
      const key = `${omo}:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const hours: 24 | 72 = /\b24\s*-?\s*(HR|HOUR)/i.test(t.subject) && !/\b72\s*-?\s*(HR|HOUR)/i.test(t.subject) ? 24 : /\b72/.test(t.subject) ? 72 : 24;
      const after = msgs.filter((m) => Date.parse(m.at) > Date.parse(notice.at));
      const reply = after.find((m) => m.mine);
      const filed = latestFiled(omo, t.id, notice.at);
      const withFiles = after.find((m) => m.mine && (m.files?.length || 0) > 0) || (filed ? { at: filed.at, text: "", hpd: false, mine: true, files: [filed.name] } : undefined);
      const lastFiles = [...after].reverse().find((m) => m.mine && (m.files?.length || 0) > 0);
      const answer = lastFiles ? after.find((m) => m.hpd && !m.mine && Date.parse(m.at) > Date.parse(lastFiles.at)) : undefined;
      const mark = input.marks[key] || {};
      const sentAt = input.sent[omo]?.sentAt || "";
      const lastMine = [...after].reverse().find((m) => m.mine);
      const lastTheirs = lastMine ? [...after].reverse().find((m) => m.hpd && !m.mine && Date.parse(m.at) > Date.parse(lastMine.at)) : undefined;
      finish({
        lastMineAt: [lastMine?.at || "", filed?.at || ""].sort().at(-1) || "", lastTheirsAt: lastTheirs?.at || "", filed,
        key, omo, threadId: t.id, subject: t.subject, kind: "ppn", hours, who, to,
        noticeAt: notice.at, dueAt: dueAfterWeekdays(notice.at, hours), followUpAt: "", // weekdays only: Friday's 24-hour notice is due Monday
        want: "the affidavit and invoice, or an update on the job",
        steps: { replied: step(reply?.at || "", "", mark.replied), made: step(withFiles?.at || "", sentAt, mark.made), sent: step(withFiles?.at || "", "", mark.sent), confirmed: step(answer?.at || "", closed.has(omo) ? "closed" : "", mark.confirmed) },
        sentAt, noticeText: notice.text.slice(0, 2500),
      });
      continue;
    }
    // A missing-documents list: one row per job on it.
    if (!DOCS.test(t.subject) || now - Date.parse(theirs[theirs.length - 1].at) > docsDays * 86400000) continue;
    for (const omo of t.omos) {
      const listed = theirs.find((m) => m.text.includes(omo));
      if (!listed) continue;
      const key = `${omo}:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = new RegExp(`${omo}\\s*[-–:]\\s*([^\\n\\d]{3,60})`, "i").exec(listed.text);
      const after = msgs.filter((m) => Date.parse(m.at) > Date.parse(listed.at));
      // A reply counts for this job when it names it, or names no job (an answer to the whole list).
      const reply = after.find((m) => m.mine && (m.text.includes(omo) || namesJob(m, omo) || (!/\b[A-Z]{2}\d{5}\b/.test(m.text) && !(m.files || []).some((f) => /[A-Z]{2}\d{5}/i.test(f)))));
      // Paperwork for THIS job: our email with files that names it (in the text or the file name) in her thread, or an
      // affidavit / invoice named for it sent anywhere (any date: she gets told it went, not sent it twice). Photos
      // asks need photos, so a PDF elsewhere doesn't count for them.
      const here = after.find((m) => m.mine && (m.files?.length || 0) > 0 && (m.text.includes(omo) || namesJob(m, omo)));
      const photosOnly = /photo/i.test(line?.[1] || "") && !/affidavit|invoice/i.test(line?.[1] || "");
      const filed = here ? { at: here.at, name: (here.files || []).find((f) => f.toUpperCase().includes(omo)) || (here.files || [])[0] || "", here: true } : photosOnly ? null : latestFiled(omo, t.id);
      const withFiles = here || (filed ? { at: filed.at, text: "", hpd: false, mine: true, files: [filed.name] } : undefined);
      // Their answer after ours in her thread: any answer counts when our email's files are named for this job.
      const answer = here ? after.find((m) => m.hpd && !m.mine && Date.parse(m.at) > Date.parse(here.at) && (m.text.includes(omo) || namesJob(here, omo))) : undefined;
      const follow = theirs.filter((m) => Date.parse(m.at) > Date.parse(listed.at)).at(-1);
      const mark = input.marks[key] || {};
      const sentAt = input.sent[omo]?.sentAt || "";
      // Ours for this job (names it, or answers the whole list); theirs after it in the same thread.
      // Only emails about THIS job (naming it, or its PDF) start the waiting clock and can be answered.
      const lastMineHere = [...after].reverse().find((m) => m.mine && (m.text.includes(omo) || namesJob(m, omo)));
      const lastMine = [lastMineHere, withFiles].filter(Boolean).sort((a, b) => Date.parse(b!.at) - Date.parse(a!.at))[0];
      const generalOnly = !!reply && !lastMine && !mark.replied && !mark.sent;
      // Her answer counts for this job when it names it, or comes right after our email about this job (no other email
      // of ours in between: "Received." after the EO32701 PDF is for EO32701, not the rest of the list).
      const lastTheirs = lastMine && lastMineHere ? [...after].reverse().find((m) => m.hpd && !m.mine && Date.parse(m.at) > Date.parse(lastMine.at)
        && (m.text.includes(omo) || !after.some((x) => x.mine && Date.parse(x.at) > Date.parse(lastMine.at) && Date.parse(x.at) < Date.parse(m.at)))) : undefined;
      finish({
        lastMineAt: lastMine?.at || "", lastTheirsAt: lastTheirs?.at || "", filed, generalOnly,
        key, omo, threadId: t.id, subject: t.subject, kind: "docs", hours: 0, who, to,
        noticeAt: listed.at, dueAt: "", followUpAt: follow?.at || "",
        want: line ? line[1].trim().replace(/\s+/g, " ") : "documents / an update",
        steps: { replied: step(reply?.at || "", "", mark.replied), made: step(withFiles?.at || "", sentAt, mark.made), sent: step(withFiles?.at || "", "", mark.sent), confirmed: step(answer?.at || "", closed.has(omo) ? "closed" : "", mark.confirmed) },
        sentAt, noticeText: listed.text.slice(0, 2500),
      });
    }
  }
  // Notices to do first (nearest deadline first), then missing documents to do (oldest ask first), then sent and
  // waiting on them, then done (newest first).
  const rank = (r: BoardRow) => (!r.next ? 3 : r.steps.sent.done ? 2 : r.kind === "docs" ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? Date.parse(a.dueAt) - Date.parse(b.dueAt) || Date.parse(a.noticeAt) - Date.parse(b.noticeAt) : rank(a) === 3 ? Date.parse(b.noticeAt) - Date.parse(a.noticeAt) : Date.parse(a.noticeAt) - Date.parse(b.noticeAt)));
}

// Hours left before the deadline (negative: overdue; Infinity: no deadline).
export function hoursLeft(row: BoardRow, now = Date.now()) {
  return row.dueAt ? (Date.parse(row.dueAt) - now) / 3600000 : Infinity;
}

// Days since they asked (missing documents).
export function daysWaiting(row: BoardRow, now = Date.now()) {
  return Math.floor((now - Date.parse(row.noticeAt)) / 86400000);
}

// Open notices with under 6 hours left (or overdue) and nothing sent yet: the reminder.
export function urgentRows(rows: BoardRow[], now = Date.now()) {
  return rows.filter((r) => r.next && r.kind === "ppn" && !r.steps.sent.done && hoursLeft(r, now) < 6);
}

// A ready reply for the owner to check (never sent without the owner's taps): what we have and what comes next.
// No answer (owner, 19 Oct "next upgrade"): paperwork sent, they never confirmed. Days since our last word (the reply,
// the paperwork, or a follow-up we sent from the app); 0 until it's been 5 days.
export const NUDGE_AFTER_DAYS = 5;
export function nudgeDays(row: BoardRow, now = Date.now(), nudgedAt = "") {
  if (row.next !== "confirmed") return 0;
  const times = [row.steps.sent.at, row.steps.replied.at, nudgedAt].map((x) => Date.parse(x || "")).filter(Number.isFinite);
  if (!times.length) return 0;
  const days = Math.floor((now - Math.max(...times)) / 86400000);
  return days >= NUDGE_AFTER_DAYS ? days : 0;
}
// The follow-up: "we sent it on <date>, please confirm you received it".
export function draftNudge(row: BoardRow, address: string) {
  const first = (row.who || "").split(/\s+/)[0] || "";
  const at = row.steps.sent.at || row.sentAt;
  const when = Date.parse(at || "") ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T12:00:00` : at).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "";
  const what = row.kind === "docs" && /photo/i.test(row.want) ? "photos" : "affidavit and invoice";
  return {
    subject: `RE: ${row.subject}`.slice(0, 200),
    text: `Hello${first ? ` ${first}` : ""},\n\nRe: OMO# ${row.omo}${address ? ` - ${address}` : ""}\n\nFollowing up: the ${what} for this job ${when ? `were sent to you on ${when}` : "were sent to you"}. Can you please confirm you received them and that nothing else is needed? If anything is missing, let us know and we will send it right away.\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`,
  };
}

export function draftReply(row: BoardRow, address: string) {
  const first = (row.who || "").split(/\s+/)[0] || "";
  const sentDate = row.sentAt ? new Date(`${row.sentAt}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "";
  const docs = row.kind === "docs";
  const what = docs && /photo/i.test(row.want) ? "photos" : "affidavit and invoice";
  const body = row.steps.sent.done
    ? `The ${what} for this job ${sentDate ? `were sent on ${sentDate}` : "were sent"}. Please let us know if you did not receive them or need anything else.`
    : row.sentAt
      ? `The ${what} for this job were sent on ${sentDate}. We will send them to you again today.`
      : row.steps.made.done
        ? `The ${what} for this job are ready and will be sent to you today.`
        : docs
          ? `We are working on this job and will send the ${what} (or an update) as soon as possible.`
          : "We received your notice. We are on it and will send the affidavit and invoice (or an update on the job) within the deadline.";
  return {
    subject: `RE: ${row.subject}`.slice(0, 200),
    text: `Hello${first ? ` ${first}` : ""},\n\nRe: OMO# ${row.omo}${address ? ` - ${address}` : ""}\n\n${body}\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`,
  };
}
