// 🔎 Check every notice (owner, 5 Nov: "ER01720 is already sent ... I want an AI helper button that's gonna research
// every notice we get from my email, and then give me the results like this OMO I gave you. We already sent this one
// and it's still coming up ... we cannot make mistakes like this").
// Every notice and missing-documents list from the email, one line per job: already sent (when, which PDF, in which
// email; don't send again), to send (and by when), HPD found a problem, or check first (paperwork on record but no
// email with the PDF found). HPD's other emails on the job (a STOP WORK NOTICE) are named too. All from the emails
// already on the phone: no paid AI, nothing sent.

import type { BoardRow, BoardThread } from "./notice-board";

export type CheckTone = "fix" | "check" | "tosend" | "sent" | "done";
export type NoticeCheckItem = { omo: string; tone: CheckTone; head: string; lines: string[]; rowKey: string };
export type NoticeCheck = { summary: string; items: NoticeCheckItem[] };

const md = (iso: string) => { const t = Date.parse(iso); if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}${iso.slice(0, 4) === String(new Date().getFullYear()) ? "" : `/${iso.slice(2, 4)}`}`; if (!Number.isFinite(t)) return iso; return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric" }).format(new Date(t)); };
const nyDay = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t)) : ""; };
const OTHER = /stop work|cancel+ed|rescind|void/i;
const RANK: Record<CheckTone, number> = { fix: 0, check: 1, tosend: 2, sent: 3, done: 4 };

export function checkNotices(rows: BoardRow[], threads: BoardThread[], now = Date.now()): NoticeCheck {
  // The newest notice per job.
  const latest = new Map<string, BoardRow>();
  for (const r of rows) { const o = latest.get(r.omo); if (!o || Date.parse(r.noticeAt) > Date.parse(o.noticeAt)) latest.set(r.omo, r); }
  const subjectOf = (at: string) => threads.find((t) => t.messages.some((m) => m.mine && m.at === at))?.subject || "";
  const items: NoticeCheckItem[] = [];
  for (const r of latest.values()) {
    const kind = r.kind === "ppn" ? `${r.hours} h notice ${md(r.noticeAt)}` : `missing documents ${md(r.noticeAt)}`;
    const lines: string[] = [];
    // HPD's other emails about this job after the notice (a stop work notice).
    for (const t of threads) {
      if (!t.omos.includes(r.omo) || !OTHER.test(t.subject)) continue;
      const m = t.messages.find((x) => x.hpd && !x.mine);
      if (m) lines.push(`🛑 HPD sent a ${/stop work/i.test(t.subject) ? "STOP WORK NOTICE" : t.subject.replace(/^.*?(cancel\w*|rescind\w*|void\w*).*$/i, "$1")} ${md(m.at)}.`);
    }
    let tone: CheckTone;
    let head: string;
    const sent = r.steps.sent;
    if (r.problem && !sent.done) {
      tone = "fix";
      head = `⚠ HPD found a problem ${md(r.problem.at)}: fix it and send it again`;
      lines.unshift(`HPD: "${r.problem.text.slice(0, 140)}"`);
    } else if (sent.done) {
      const file = r.filed?.name || "";
      const where = sent.how === "email" ? (r.filed && !r.filed.here ? ` (in your email "${subjectOf(r.filed.at) || "another thread"}")` : " (in this thread)") : sent.how === "tap" ? " (you marked it sent)" : "";
      const confirmed = !r.next;
      tone = confirmed ? "done" : "sent";
      head = `✅ Already sent ${md(sent.at)}${file ? `: ${file}` : ""}. Don't send it again`;
      lines.unshift(`${where.trim() ? `Sent${where}.` : ""}`.trim());
      if (confirmed) lines.push(r.answered ? `HPD answered ${md(r.answered.at)}: "${r.answered.text.slice(0, 100)}"` : r.steps.confirmed.how === "record" ? "HPD closed the job." : `Done ${md(r.steps.confirmed.at)}.`);
      else if (r.lastTheirsAt && Date.parse(r.lastTheirsAt) > Date.parse(sent.at)) lines.push(`HPD wrote back ${md(r.lastTheirsAt)}: read it.`);
      else lines.push(`Waiting on HPD (${Math.max(0, Math.floor((now - Date.parse(sent.at)) / 86400000))} days).`);
    } else if (r.sentAt && r.sentAt >= nyDay(r.noticeAt)) {
      tone = "check";
      head = `🔍 Check first: paperwork on record ${md(r.sentAt)}, after this notice`;
      lines.unshift("No email with this job's PDF was found. Look in your Sent mail before sending it again.");
    } else {
      tone = "tosend";
      const h = r.dueAt ? Math.round((Date.parse(r.dueAt) - now) / 3600000) : null;
      head = `❗ Not sent yet${h === null ? "" : h < 0 ? `: overdue ${-h} h` : `: ${h} h left`}`;
      lines.unshift(`They want ${r.want}.`);
      if (r.sentAt) lines.push(`Paperwork on record from ${md(r.sentAt)}, before this notice.`);
      if (r.generalOnly) lines.push("Your reply to the whole list doesn't count as this job sent.");
    }
    items.push({ omo: r.omo, tone, head, lines: [`${r.kind === "ppn" ? "⏱" : "📋"} ${kind} from ${r.who}.`, ...lines.filter(Boolean)], rowKey: r.key });
  }
  items.sort((a, b) => RANK[a.tone] - RANK[b.tone] || a.omo.localeCompare(b.omo));
  const n = (t: CheckTone) => items.filter((x) => x.tone === t).length;
  const parts = [n("sent") + n("done") ? `${n("sent") + n("done")} already sent` : "", n("tosend") ? `${n("tosend")} to send` : "", n("fix") ? `${n("fix")} to fix` : "", n("check") ? `${n("check")} to check first` : ""].filter(Boolean);
  return { summary: items.length ? `Checked ${items.length} notice${items.length === 1 ? "" : "s"} from your email: ${parts.join(", ")}.` : "No notices from HPD in your email in the last month.", items };
}
