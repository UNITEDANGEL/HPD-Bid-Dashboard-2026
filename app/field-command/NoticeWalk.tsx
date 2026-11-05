"use client";

// 🗂 Go through my notices (owner, 5 Nov: "go through each and every notice in detail. Take me to the notice, tell me
// what they're asking, what should we do now, the work description, public hall or apartment, the name and phone").
// One notice at a time, the ones still to send first (most urgent first). The card says what the emails show (was the
// affidavit and invoice sent? HPD's answer), the job, the tenant, and the next step with one tap each. Nothing is sent
// from here: replies and paperwork keep their own two taps.
import { useState } from "react";
import { boardSide, hoursLeft, type BoardRow } from "../../lib/notice-board";

export type WalkFacts = {
  address: string;
  where: string;            // "Apartment 3B" / "Public hall"
  work: string;             // HPD's work description (short)
  tenant: { name: string; phone: string } | null;
  calls: string[];          // what HPD said on the phone (☎️ notes on the job)
  found: string[];          // what the app has on record (notice-findings)
  outcome: string;          // the job's outcome on the phone ("work_completed"…) or ""
};

const day = (iso: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "");
const first = (who: string) => (who || "Vendor tracking").split(/\s+/)[0];

export function walkClock(row: BoardRow, now = Date.now()) {
  if (row.kind === "docs") return `asked ${day(row.noticeAt)}`;
  if (row.steps.sent.done) return "sent";
  const h = hoursLeft(row, now);
  const m = Math.round(Math.abs(h) * 60);
  const t = m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h` : `${m}m`;
  return h < 0 ? `OVERDUE ${t}` : `${t} left`;
}

// What to do now, in one line, and which button does it.
export function walkNext(row: BoardRow, f: WalkFacts): { text: string; go: "fix" | "tell" | "send" | "make" | "reply" | "read" | "wait" } {
  if (row.problem) return { text: `${first(row.who)} found a problem with what you sent: fix it with the same dates as the original, then send it again.`, go: "fix" };
  if (boardSide(row) === "replied") return { text: `${first(row.who)} answered you: read it, then reply.`, go: "read" };
  if (row.steps.sent.done) return { text: "Sent and waiting on HPD. Nothing to do unless they write back.", go: "wait" };
  if (row.filed) return { text: `The affidavit and invoice already went by email on ${day(row.filed.at)} (${row.filed.name}). Tell them the date; don't send it twice.`, go: "tell" };
  if (row.steps.made.done || row.sentAt) return { text: "The paperwork is made: email it to them now.", go: "send" };
  if (f.outcome) return { text: "The job's outcome is saved: make the affidavit and invoice, then send them.", go: "make" };
  return { text: "No paperwork yet. Tell them where the job stands (AI writes it), then make the paperwork.", go: "reply" };
}

export function walkSpeech(row: BoardRow, f: WalkFacts, i: number, n: number) {
  const what = row.kind === "docs" ? `${first(row.who)} asked for ${row.want}` : `${first(row.who)}'s ${row.hours}-hour notice, ${walkClock(row).toLowerCase()}`;
  return `Notice ${i + 1} of ${n}. ${f.address || row.omo}. ${what}. ${walkNext(row, f).text}`;
}

type Props = {
  row: BoardRow; facts: WalkFacts; index: number; total: number; waitingCount: number;
  paperHref: string; fixHref: string;
  onReply: () => void; onBoard: () => void; onJob: () => void; onThread: () => void;
  onHandled: () => void; onNext: () => void; onPrev: () => void; onStop: () => void; onSpeak: () => void;
};

export default function NoticeWalk({ row, facts, index, total, waitingCount, paperHref, fixHref, onReply, onBoard, onJob, onThread, onHandled, onNext, onPrev, onStop, onSpeak }: Props) {
  const [armed, setArmed] = useState("");
  const next = walkNext(row, facts);
  const sent = row.steps.sent.done && !row.problem;
  const late = !sent && row.kind === "ppn" && hoursLeft(row, Date.now()) < 0;
  return (
    <section className={`fc-walk${sent ? " is-sent" : " is-unsent"}${late ? " is-late" : ""}`} role="dialog" aria-label={`Notice ${index + 1} of ${total}`} data-hpd-smoke="fc-walk" data-omo={row.omo}>
      <header>
        <b data-hpd-smoke="fc-walk-count">🗂 Notice {index + 1} of {total}</b>
        <button type="button" aria-label="Read it to me" onClick={onSpeak}>🔊</button>
        <button type="button" data-hpd-smoke="fc-walk-stop" onClick={onStop}>✕</button>
      </header>
      <p className="fc-walk-kind">
        {row.kind === "ppn" && !sent ? <span className="fc-fire" aria-hidden="true">🔥</span> : sent ? <span className="fc-walk-ok" aria-hidden="true">✓</span> : <span aria-hidden="true">📋</span>}
        <b>{row.kind === "docs" ? "Missing documents" : `${row.hours}-hour notice`}</b> from {row.who} · {day(row.noticeAt)} · <em data-hpd-smoke="fc-walk-clock">{walkClock(row)}</em>
      </p>
      <p className="fc-walk-job"><b>{row.omo}</b>{facts.address ? ` · ${facts.address}` : ""}</p>
      <dl>
        <div><dt>❓ They ask</dt><dd data-hpd-smoke="fc-walk-want">{row.want}</dd></div>
        <div><dt>📧 Your email</dt><dd data-hpd-smoke="fc-walk-email">
          {row.filed ? <span className="is-good">✅ Affidavit &amp; invoice emailed {day(row.filed.at)} ({row.filed.name})</span> : row.steps.sent.done ? <span className="is-good">✅ Paperwork sent {day(row.steps.sent.at)}</span> : <span className="is-bad">❌ No affidavit or invoice in your sent email for this notice</span>}
          {row.steps.replied.done && !row.filed ? <span> · ✉ you replied {day(row.steps.replied.at)}</span> : null}
          {row.problem ? <span className="is-bad" data-hpd-smoke="fc-walk-problem">⚠️ {first(row.who)} wrote {day(row.problem.at)}: “{row.problem.text}”</span> : null}
          {row.answered && !row.problem ? <span className="is-good">✅ {first(row.who)} answered {day(row.answered.at)}: “{row.answered.text.slice(0, 90)}”</span> : null}
        </dd></div>
        {facts.work ? <div><dt>🔧 The work</dt><dd data-hpd-smoke="fc-walk-work">{facts.where ? <b>{facts.where} · </b> : null}{facts.work}</dd></div> : null}
        <div><dt>👤 Tenant</dt><dd data-hpd-smoke="fc-walk-tenant">{facts.tenant && (facts.tenant.name || facts.tenant.phone) ? <>{facts.tenant.name || "Tenant"}{facts.tenant.phone ? <> · <a href={`tel:${facts.tenant.phone.replace(/[^\d+]/g, "")}`}>{facts.tenant.phone}</a></> : null}</> : facts.where === "Public hall" ? "Public area: no tenant needed" : "No name or phone on record"}</dd></div>
        {facts.calls.length ? <div><dt>☎️ HPD on the phone</dt><dd>{facts.calls.slice(-2).join(" · ")}</dd></div> : null}
        {facts.found.length ? <div><dt>🔎 On record</dt><dd>{facts.found.slice(0, 3).join(" · ")}</dd></div> : null}
      </dl>
      <p className="fc-walk-next" data-hpd-smoke="fc-walk-next">👉 {next.text}</p>
      <div className="fc-walk-go">
        {next.go === "fix" ? <a className="is-main" data-hpd-smoke="fc-walk-fix" href={fixHref}>✏️ Fix it (same dates)</a> : null}
        {next.go === "send" || next.go === "make" ? <a className="is-main" data-hpd-smoke="fc-walk-paper" href={paperHref}>{next.go === "send" ? "📤 Send the paperwork" : "📄 Make the paperwork"}</a> : null}
        {next.go === "read" ? <button type="button" className="is-main" onClick={onThread}>💬 Read their answer</button> : null}
        {next.go !== "wait" ? <button type="button" className={next.go === "tell" || next.go === "reply" ? "is-main" : ""} data-hpd-smoke="fc-walk-reply" onClick={onReply}>✨ {next.go === "tell" ? "Tell them the date (AI)" : "Reply with AI"}</button> : null}
        {next.go === "reply" ? <a data-hpd-smoke="fc-walk-paper" href={paperHref}>📄 Make the paperwork</a> : null}
        {!sent ? <button type="button" className={`is-done${armed === row.key ? " is-armed" : ""}`} data-hpd-smoke="fc-walk-handled" onClick={() => { if (armed !== row.key) { setArmed(row.key); return; } setArmed(""); onHandled(); }}>{armed === row.key ? "✅ Tap again: it's sent / fixed" : "✅ Already sent / fixed"}</button> : null}
        <button type="button" onClick={onBoard}>📋 On the board</button>
        <button type="button" onClick={onJob}>Job card</button>
      </div>
      <footer>
        <button type="button" disabled={index === 0} onClick={onPrev}>◀ Back</button>
        <small>{waitingCount ? `${waitingCount} sent & waiting on HPD (skipped)` : ""}</small>
        <button type="button" className="is-next" data-hpd-smoke="fc-walk-next-btn" onClick={onNext}>{index + 1 >= total ? "Finish ✓" : "Next ▶"}</button>
      </footer>
    </section>
  );
}
