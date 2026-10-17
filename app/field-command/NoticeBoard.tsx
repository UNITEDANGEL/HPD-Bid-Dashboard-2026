"use client";

// The 24 / 72-hour board (owner, 17 Oct 2026): each poor performance notice from vendor tracking with its countdown
// and four steps (reply sent -> paperwork made -> sent to vendor tracking -> confirmed). Steps tick by themselves
// from the emails / paperwork on record, or with a tap. Replies are drafted here; nothing is sent without two taps.
import { useEffect, useState } from "react";
import { BOARD_STEPS, draftReply, hoursLeft, type BoardRow, type BoardStep } from "../../lib/notice-board";

type Props = {
  rows: BoardRow[];
  addressOf: (omo: string) => string;
  hasJob: (omo: string) => boolean;
  onOpenJob: (omo: string) => void;
  onOpenThread: (threadId: string, title: string) => void;
  onMark: (key: string, step: BoardStep, on: boolean) => void;
  onClose: () => void;
};

const OUTCOMES = [["work_completed", "✅ Work completed"], ["refused_access", "🚫 Refused access"], ["no_access", "🚪 No access"], ["completed_by_others", "👷 Completed by others"], ["partial_work_completed", "🔁 Partly done / going back"]] as const;

function clock(h: number) {
  const m = Math.round(Math.abs(h) * 60);
  const txt = m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return h >= 0 ? `${txt} left` : `OVERDUE ${txt}`;
}
const day = (iso: string) => (iso && iso !== "closed" ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "");

export default function NoticeBoard({ rows, addressOf, hasJob, onOpenJob, onOpenThread, onMark, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  const [showDone, setShowDone] = useState(false);
  const [reply, setReply] = useState<{ key: string; to: string; subject: string; text: string; armed: boolean; status: string } | null>(null);
  // AI-written reply (server/ai-draft.mjs): written from the facts on record and their notice; you read and edit it.
  const [ai, setAi] = useState<{ key: string; note: string; busy: boolean; msg: string }>({ key: "", note: "", busy: false, msg: "" });
  const writeWithAi = async (row: BoardRow, note: string) => {
    setAi({ key: row.key, note, busy: true, msg: "✨ AI is writing the reply…" });
    try {
      const r = await fetch("/api/drive/hpd-draft", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ omo: row.omo, address: addressOf(row.omo), who: row.who, hours: row.hours, noticeAt: row.noticeAt, dueAt: row.dueAt, hoursLeft: hoursLeft(row, Date.now()), sentAt: row.sentAt, steps: { replied: row.steps.replied.done, made: row.steps.made.done, sent: row.steps.sent.done }, note, noticeText: row.noticeText }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ai && d.text) {
        setReply((cur) => (cur && cur.key === row.key ? { ...cur, text: d.text, armed: false } : cur));
        setAi({ key: row.key, note, busy: false, msg: "✨ Written by AI from the facts on record. Read it and fix anything before sending." });
      } else {
        setAi({ key: row.key, note, busy: false, msg: r.status === 401 ? "Sign in with Google on this phone to use the AI. The ready reply is below." : d.reason === "not-set-up" ? "AI isn’t switched on for the app yet. The ready reply is below." : `${d.reason || d.error || "The AI didn’t answer"}. The ready reply is below.` });
      }
    } catch {
      setAi({ key: row.key, note, busy: false, msg: "No connection to the AI. The ready reply is below." });
    }
  };
  const open = rows.filter((r) => r.next);
  const done = rows.filter((r) => !r.next);
  const under6 = open.filter((r) => !r.steps.sent.done && hoursLeft(r, now) < 6 && hoursLeft(r, now) >= 0).length;
  const overdue = open.filter((r) => !r.steps.sent.done && hoursLeft(r, now) < 0).length;
  const waiting = open.filter((r) => r.next === "confirmed").length;

  const send = async (row: BoardRow, toSelf: boolean) => {
    if (!reply) return;
    if (!toSelf && !reply.armed) { setReply({ ...reply, armed: true }); return; }
    setReply({ ...reply, status: "Sending…" });
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toSelf ? { toSelf: true, subject: reply.subject, text: reply.text } : { to: reply.to, subject: reply.subject, text: reply.text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      if (toSelf) { setReply({ ...reply, armed: false, status: `✓ Sent to you (${d.to}). Nothing went to HPD.` }); return; }
      onMark(row.key, "replied", true);
      setReply({ ...reply, armed: false, status: `✓ Sent to ${d.to}.` });
    } catch (e) {
      setReply({ ...reply, armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}. Nothing went out.` });
    }
  };

  const card = (row: BoardRow) => {
    const h = hoursLeft(row, now);
    const late = !row.steps.sent.done && h < 0;
    const hot = !row.steps.sent.done && h < 6;
    const address = addressOf(row.omo);
    return (
      <li key={row.key} className={`fc-board-row is-${row.hours}h${hot ? " is-hot" : ""}${late ? " is-late" : ""}${row.next ? "" : " is-done"}`} data-hpd-smoke="fc-board-row" data-next={row.next || "done"}>
        <div className="fc-board-top">
          <span className="fc-board-clock" data-hpd-smoke="fc-board-clock">{row.next ? (row.steps.sent.done ? "📤 Sent · waiting" : `⏱ ${clock(h)}`) : "✅ Done"}</span>
          <span className="fc-board-kind">{row.hours}-HOUR</span>
        </div>
        <p className="fc-board-job"><b>{row.omo}</b>{address ? ` · ${address}` : ""}</p>
        <p className="fc-board-from">From {row.who} · {day(row.noticeAt)}{row.sentAt ? ` · paperwork on record ${day(row.sentAt)}` : ""}</p>
        <ol className="fc-board-steps" data-hpd-smoke="fc-board-steps">
          {BOARD_STEPS.map((s) => {
            const st = row.steps[s.key];
            const auto = st.how === "email" || st.how === "record";
            return (
              <li key={s.key} className={`${st.done ? "is-done" : ""}${row.next === s.key ? " is-next" : ""}`}>
                <button type="button" disabled={auto} data-hpd-smoke={`fc-board-step-${s.key}`} title={auto ? (st.how === "email" ? "From the emails" : "Paperwork on record") : st.done ? "Tap to undo" : "Tap when done"} onClick={() => onMark(row.key, s.key, !st.done)}>
                  <span aria-hidden="true">{st.done ? "✓" : s.icon}</span>
                  <small>{s.label}{st.done && st.at ? ` ${st.at === "closed" ? "(closed)" : day(st.at)}` : ""}</small>
                </button>
              </li>
            );
          })}
        </ol>
        {row.next === "replied" || row.next === "sent" ? (
          <p className="fc-board-todo">{row.next === "replied" ? "Next: answer them (a reply is ready below)." : "Next: email them the affidavit and invoice, then tap 📤."}</p>
        ) : row.next === "made" ? (
          <>
            <p className="fc-board-todo">Next: the paperwork. What happened at the job?</p>
            <div className="fc-prio-outcomes">{OUTCOMES.map(([k, label]) => <a key={k} href={`/paperwork/?job=${encodeURIComponent(row.omo)}&outcome=${k}`} data-hpd-smoke={`fc-board-outcome-${k}`}>{label}</a>)}</div>
          </>
        ) : row.next === "confirmed" ? <p className="fc-board-todo">Waiting for them to confirm. Tap ✅ when they do.</p> : null}
        <div className="fc-notice-actions">
          {row.next ? <button type="button" data-hpd-smoke="fc-board-reply" onClick={() => { const d = draftReply(row, address); setReply({ key: row.key, to: row.to, subject: d.subject, text: d.text, armed: false, status: "" }); void writeWithAi(row, ""); }}>✨ Reply (AI)</button> : null}
          <button type="button" onClick={() => onOpenThread(row.threadId, `${row.omo}: ${row.subject}`)}>💬 Their email</button>
          {hasJob(row.omo) ? <button type="button" onClick={() => onOpenJob(row.omo)}>Open job</button> : null}
        </div>
        {reply?.key === row.key ? (
          <div className="fc-ack" data-hpd-smoke="fc-board-reply-box">
            <b>Email to {row.who}{reply.to ? ` <${reply.to}>` : ""}</b>
            {!reply.to ? <p className="fc-ack-status">No @hpd.nyc.gov address in their email: use 💬 Their email -&gt; Reply in Gmail.</p> : null}
            {ai.key === row.key && ai.msg ? <p className={`fc-ai-msg${ai.busy ? " is-busy" : ""}`} data-hpd-smoke="fc-board-ai-msg">{ai.msg}</p> : null}
            <div className="fc-ai-ask">
              <input data-hpd-smoke="fc-board-ai-note" placeholder="Tell the AI what to add (optional), e.g. we went back Friday" value={ai.key === row.key ? ai.note : ""} onChange={(e) => setAi({ ...ai, key: row.key, note: e.target.value })} />
              <button type="button" data-hpd-smoke="fc-board-ai-write" disabled={ai.busy} onClick={() => void writeWithAi(row, ai.key === row.key ? ai.note : "")}>✨ {ai.key === row.key && ai.msg && !ai.busy ? "Write again" : "Write with AI"}</button>
            </div>
            <label>Subject<input value={reply.subject} onChange={(e) => setReply({ ...reply, subject: e.target.value, armed: false })} /></label>
            <label>Message<textarea data-hpd-smoke="fc-board-reply-text" rows={8} value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value, armed: false })} /></label>
            <div className="fc-ack-actions">
              <button type="button" className={reply.armed ? "is-armed" : ""} data-hpd-smoke="fc-board-reply-send" disabled={!reply.to || reply.status === "Sending…"} onClick={() => void send(row, false)}>{reply.armed ? `✅ Tap again: send to ${reply.to}` : "✉ Send"}</button>
              <button type="button" disabled={reply.status === "Sending…"} onClick={() => void send(row, true)}>📨 Send to me first</button>
              <button type="button" onClick={() => setReply(null)}>Close</button>
            </div>
            {reply.status ? <p className="fc-ack-status">{reply.status}</p> : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="fc-package-sheet fc-summary-sheet fc-board-sheet" role="dialog" aria-label="24 / 72-hour board" data-hpd-smoke="fc-board">
      <header>
        <strong>⏱ 24 / 72-hour board</strong>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-board-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <div className="fc-board-sum" data-hpd-smoke="fc-board-sum">
          <span><b>{open.length}</b> open</span>
          <span className={overdue ? "is-late" : ""}><b>{overdue}</b> overdue</span>
          <span className={under6 ? "is-hot" : ""}><b>{under6}</b> under 6 h</span>
          <span><b>{waiting}</b> waiting on them</span>
        </div>
        <p className="fc-follow-note">Each notice from vendor tracking until it&apos;s confirmed: ✉ reply → 📄 paperwork → 📤 sent → ✅ confirmed. Steps tick by themselves from your emails and the paperwork on record; tap a step to tick it by hand.</p>
        {!rows.length ? <p className="fc-follow-note">No 24 / 72-hour notices in the last 30 days. 🎉</p> : null}
        <ol className="fc-board-list">{open.map(card)}</ol>
        {done.length ? (
          <>
            <button type="button" className="fc-board-done-toggle" data-hpd-smoke="fc-board-done-toggle" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide" : "Show"} done ({done.length})</button>
            {showDone ? <ol className="fc-board-list">{done.map(card)}</ol> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
