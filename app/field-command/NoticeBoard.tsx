"use client";

// The 24 / 72-hour board (owner, 17 Oct 2026): each poor performance notice from vendor tracking with its countdown
// and four steps (reply sent -> paperwork made -> sent to vendor tracking -> confirmed). Steps tick by themselves
// from the emails / paperwork on record, or with a tap. Replies are drafted here; nothing is sent without two taps.
import { useEffect, useState } from "react";
import type { NoticeFindings } from "../../lib/notice-findings";
import { BOARD_STEPS, daysWaiting, draftReply, hoursLeft, type BoardRow, type BoardStep } from "../../lib/notice-board";

type Props = {
  rows: BoardRow[];
  addressOf: (omo: string) => string;
  hasJob: (omo: string) => boolean;
  onOpenJob: (omo: string) => void;
  onOpenThread: (threadId: string, title: string) => void;
  onMark: (key: string, step: BoardStep, on: boolean) => void;
  onClose: () => void;
  initialShow?: "all" | "ppn" | "docs";
  findingsOf?: (row: BoardRow) => NoticeFindings; // what the app already has for the job (a head start)
};

const OUTCOMES = [["work_completed", "✅ Work completed"], ["refused_access", "🚫 Refused access"], ["no_access", "🚪 No access"], ["completed_by_others", "👷 Completed by others"], ["partial_work_completed", "🔁 Partly done / going back"]] as const;

// The paperwork page, set up to email the finished package to whoever sent the notice and tick the board.
const paperHref = (row: BoardRow, outcome: string) => `/paperwork/?job=${encodeURIComponent(row.omo)}${outcome ? `&outcome=${outcome}` : ""}${row.to ? "&vt=1" : ""}`;
// Who to send it to rides in this tab's session storage (not in the page address).
const rememberSend = (row: BoardRow) => { try { if (row.to) sessionStorage.setItem("hpd-vt-send", JSON.stringify({ omo: row.omo, to: row.to, name: row.who, notice: row.key, subject: `RE: ${row.subject}` })); } catch { /* private mode */ } };

function clock(h: number) {
  const m = Math.round(Math.abs(h) * 60);
  const txt = m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return h >= 0 ? `${txt} left` : `OVERDUE ${txt}`;
}
const day = (iso: string) => (iso && iso !== "closed" ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "");

export default function NoticeBoard({ rows, addressOf, hasJob, onOpenJob, onOpenThread, onMark, onClose, initialShow = "all", findingsOf }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  const [showDone, setShowDone] = useState(false);
  // Reply to many (17 Oct): every reply written on one screen; each one still goes out with its own two taps.
  type BatchItem = { key: string; subject: string; text: string; armed: boolean; status: string; sent: boolean };
  const [batch, setBatch] = useState<{ pick: "record" | "none" | "all"; items: BatchItem[]; selfStatus: string } | null>(null);
  const [reply, setReply] = useState<{ key: string; to: string; subject: string; text: string; armed: boolean; status: string } | null>(null);
  // AI-written reply (server/ai-draft.mjs): written from the facts on record and their notice; you read and edit it.
  const [ai, setAi] = useState<{ key: string; note: string; busy: boolean; msg: string }>({ key: "", note: "", busy: false, msg: "" });
  const writeWithAi = async (row: BoardRow, note: string) => {
    setAi({ key: row.key, note, busy: true, msg: "✨ AI is writing the reply…" });
    try {
      const r = await fetch("/api/drive/hpd-draft", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ omo: row.omo, address: addressOf(row.omo), who: row.who, kind: row.kind, want: row.want, hours: row.hours, noticeAt: row.noticeAt, dueAt: row.dueAt, hoursLeft: hoursLeft(row, Date.now()), sentAt: row.sentAt, steps: { replied: row.steps.replied.done, made: row.steps.made.done, sent: row.steps.sent.done }, note, noticeText: row.noticeText, found: findingsOf ? findingsOf(row).lines.map((l) => l.text) : [] }) });
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
  // Filter: everything, the 24 / 72-hour notices, or the missing-documents lists (Gafur).
  const [show, setShow] = useState<"all" | "ppn" | "docs">(initialShow);
  const shown = rows.filter((r) => show === "all" || r.kind === show);
  const open = shown.filter((r) => r.next);
  const done = shown.filter((r) => !r.next);
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

  // Who can get a reply now: open, their address known, not already waiting on them.
  const replyable = rows.filter((r) => r.next && r.next !== "confirmed" && r.to);
  const batchRows = (pick: "record" | "none" | "all") => replyable.filter((r) => pick === "all" || (pick === "record" ? !!r.sentAt || r.steps.made.done : !r.sentAt && !r.steps.made.done));
  const startBatch = (pick: "record" | "none" | "all") => setBatch({ pick, selfStatus: "", items: batchRows(pick).map((r) => { const d = draftReply(r, addressOf(r.omo)); return { key: r.key, subject: d.subject, text: d.text, armed: false, status: "", sent: false }; }) });
  const setItem = (key: string, patch: Partial<BatchItem>) => setBatch((b) => (b ? { ...b, items: b.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) } : b));
  const sendItem = async (row: BoardRow, it: BatchItem) => {
    if (!it.armed) { setItem(it.key, { armed: true }); return; }
    setItem(it.key, { status: "Sending…" });
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: row.to, subject: it.subject, text: it.text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      onMark(row.key, "replied", true);
      setItem(it.key, { armed: false, sent: true, status: `✓ Sent to ${d.to}.` });
    } catch (e) {
      setItem(it.key, { armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}. Nothing went out.` });
    }
  };
  // All the replies in one email to yourself, to read them over first.
  const sendAllToMe = async () => {
    if (!batch) return;
    setBatch({ ...batch, selfStatus: "Sending…" });
    const text = batch.items.map((it, i) => { const row = rows.find((r) => r.key === it.key); return `===== ${i + 1}. To ${row?.who || ""} <${row?.to || ""}> · ${it.subject}\n\n${it.text}`; }).join("\n\n");
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toSelf: true, subject: `${batch.items.length} replies to vendor tracking`, text: text.slice(0, 3990) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      setBatch((b) => (b ? { ...b, selfStatus: `✓ All ${b.items.length} sent to you (${d.to}) in one email. Nothing went to HPD.${text.length > 3990 ? " (Long: the last ones were cut off in that email.)" : ""}` } : b));
    } catch (e) {
      setBatch((b) => (b ? { ...b, selfStatus: `Not sent: ${e instanceof Error ? e.message : "error"}.` } : b));
    }
  };

  const card = (row: BoardRow) => {
    const h = hoursLeft(row, now);
    const late = !row.steps.sent.done && h < 0;
    const hot = !row.steps.sent.done && h < 6;
    const address = addressOf(row.omo);
    return (
      <li key={row.key} className={`fc-board-row ${row.kind === "docs" ? "is-docs" : `is-${row.hours}h`}${hot ? " is-hot" : ""}${late ? " is-late" : ""}${row.next ? "" : " is-done"}`} data-hpd-smoke="fc-board-row" data-next={row.next || "done"}>
        <div className="fc-board-top">
          <span className="fc-board-clock" data-hpd-smoke="fc-board-clock">{row.next ? (row.steps.sent.done ? "📤 Sent · waiting" : row.kind === "docs" ? `📋 Waiting ${daysWaiting(row, now)} days` : `⏱ ${clock(h)}`) : "✅ Done"}</span>
          <span className="fc-board-kind">{row.kind === "docs" ? "MISSING DOCS" : `${row.hours}-HOUR`}</span>
        </div>
        <p className="fc-board-job"><b>{row.omo}</b>{address ? ` · ${address}` : ""}</p>
        <p className="fc-board-from">From {row.who} · {day(row.noticeAt)}{row.followUpAt ? ` · followed up ${day(row.followUpAt)}` : ""}{row.sentAt ? ` · paperwork on record ${day(row.sentAt)}` : ""}</p>
        {row.kind === "docs" ? <p className="fc-board-want" data-hpd-smoke="fc-board-want">They want: <b>{row.want}</b></p> : null}
        {row.next && findingsOf ? (() => {
          const f = findingsOf(row);
          return (
            <div className="fc-found" data-hpd-smoke="fc-found">
              <b>🔎 Found on record</b>
              <ul>{f.lines.map((l, i) => <li key={i} className={`is-${l.tone}`}><span aria-hidden="true">{l.icon}</span> {l.text}</li>)}</ul>
              <p className="fc-found-next" data-hpd-smoke="fc-found-next">👉 {f.advice.text}</p>
              {f.advice.action === "resend" ? <a className="fc-found-go" data-hpd-smoke="fc-found-go" href={paperHref(row, "")} onClick={() => rememberSend(row)}>📤 Open the paperwork and send it</a>
                : f.advice.action === "make" ? <a className="fc-found-go" data-hpd-smoke="fc-found-go" href={paperHref(row, f.advice.outcome || "")} onClick={() => rememberSend(row)}>📄 Make it ({f.advice.outcome?.replace(/_/g, " ")})</a>
                : <button type="button" className="fc-found-go" data-hpd-smoke="fc-found-go" onClick={() => { const d = draftReply(row, address); setReply({ key: row.key, to: row.to, subject: d.subject, text: d.text, armed: false, status: "" }); void writeWithAi(row, ""); }}>✨ Write the update</button>}
            </div>
          );
        })() : null}
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
          <p className="fc-board-todo">{row.next === "replied" ? "Next: answer them (a reply is ready below)." : "Next: email them the affidavit and invoice: open the paperwork (it sends from there), or tap 📤 if you sent it yourself."}</p>
        ) : row.next === "made" ? (
          <>
            <p className="fc-board-todo">Next: the paperwork. What happened at the job?</p>
            <div className="fc-prio-outcomes">{OUTCOMES.map(([k, label]) => <a key={k} href={paperHref(row, k)} onClick={() => rememberSend(row)} data-hpd-smoke={`fc-board-outcome-${k}`}>{label}</a>)}</div>
          </>
        ) : row.next === "confirmed" ? <p className="fc-board-todo">Waiting for them to confirm. Tap ✅ when they do.</p> : null}
        <div className="fc-notice-actions">
          {row.next ? <button type="button" data-hpd-smoke="fc-board-reply" onClick={() => { const d = draftReply(row, address); setReply({ key: row.key, to: row.to, subject: d.subject, text: d.text, armed: false, status: "" }); void writeWithAi(row, ""); }}>✨ Reply (AI)</button> : null}
          <button type="button" onClick={() => onOpenThread(row.threadId, `${row.omo}: ${row.subject}`)}>💬 Their email</button>
          {row.next === "sent" ? <a className="fc-board-send" data-hpd-smoke="fc-board-send" href={paperHref(row, "")} onClick={() => rememberSend(row)}>📤 Send the paperwork</a> : null}
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
    <div className="fc-package-sheet fc-summary-sheet fc-board-sheet" role="dialog" aria-label="Vendor tracking board" data-hpd-smoke="fc-board">
      <header>
        <strong>⏱ Vendor tracking board</strong>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-board-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <div className="fc-board-filter" role="tablist" data-hpd-smoke="fc-board-filter">
          {([["all", "All", rows.filter((r) => r.next).length], ["ppn", "⏱ 24 / 72-hour", rows.filter((r) => r.next && r.kind === "ppn").length], ["docs", "📋 Missing documents", rows.filter((r) => r.next && r.kind === "docs").length]] as const).map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? "is-on" : ""} data-hpd-smoke={`fc-board-show-${k}`} onClick={() => setShow(k)}>{label} <b>{n}</b></button>
          ))}
        </div>
        <div className="fc-board-sum" data-hpd-smoke="fc-board-sum">
          <span><b>{open.length}</b> open</span>
          <span className={overdue ? "is-late" : ""}><b>{overdue}</b> overdue</span>
          <span className={under6 ? "is-hot" : ""}><b>{under6}</b> under 6 h</span>
          <span><b>{waiting}</b> waiting on them</span>
        </div>
        <p className="fc-follow-note">Each notice and missing-documents request from vendor tracking until it&apos;s confirmed: ✉ reply → 📄 paperwork → 📤 sent → ✅ confirmed. Steps tick by themselves from your emails and the paperwork on record; tap a step to tick it by hand.</p>
        {!rows.length ? <p className="fc-follow-note">Nothing from vendor tracking here right now. 🎉</p> : null}
        {batch ? (
          <section className="fc-batch" data-hpd-smoke="fc-batch">
            <div className="fc-batch-head">
              <button type="button" data-hpd-smoke="fc-batch-back" onClick={() => setBatch(null)}>← Back to the board</button>
              <b data-hpd-smoke="fc-batch-count">{batch.items.filter((i) => i.sent).length} of {batch.items.length} sent</b>
            </div>
            <div className="fc-board-filter" role="tablist">
              {([["record", "Paperwork on record"], ["none", "No paperwork yet"], ["all", "All"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={batch.pick === k} className={batch.pick === k ? "is-on" : ""} data-hpd-smoke={`fc-batch-pick-${k}`} onClick={() => startBatch(k)}>{label} <b>{batchRows(k).length}</b></button>
              ))}
            </div>
            <p className="fc-follow-note">Every reply is written. Read each one; fix anything; then Send (two taps) one by one. Or send them all to yourself first in one email.</p>
            <button type="button" className="fc-batch-self" data-hpd-smoke="fc-batch-self" disabled={!batch.items.length || batch.selfStatus === "Sending…"} onClick={() => void sendAllToMe()}>📨 Send all {batch.items.length} to me first (one email)</button>
            {batch.selfStatus ? <p className="fc-ack-status" data-hpd-smoke="fc-batch-self-status">{batch.selfStatus}</p> : null}
            {!batch.items.length ? <p className="fc-follow-note">No replies to write here.</p> : null}
            <ol className="fc-batch-list">
              {batch.items.map((it, i) => {
                const row = rows.find((r) => r.key === it.key);
                if (!row) return null;
                return (
                  <li key={it.key} className={it.sent ? "is-sent" : ""} data-hpd-smoke="fc-batch-item">
                    <p className="fc-batch-to"><b>{i + 1}. {row.omo}</b> · to {row.who} &lt;{row.to}&gt; · {row.kind === "docs" ? `missing docs (${row.want})` : `${row.hours}-hour notice`}</p>
                    <input aria-label="Subject" value={it.subject} disabled={it.sent} onChange={(e) => setItem(it.key, { subject: e.target.value, armed: false })} />
                    <textarea aria-label="Message" rows={7} value={it.text} disabled={it.sent} data-hpd-smoke="fc-batch-text" onChange={(e) => setItem(it.key, { text: e.target.value, armed: false })} />
                    <button type="button" className={it.sent ? "is-sent" : it.armed ? "is-armed" : ""} disabled={it.sent || it.status === "Sending…"} data-hpd-smoke="fc-batch-send" onClick={() => void sendItem(row, it)}>{it.sent ? "✓ Sent" : it.armed ? `✅ Tap again: send to ${row.to}` : "✉ Send"}</button>
                    {it.status ? <p className="fc-ack-status" data-hpd-smoke="fc-batch-status">{it.status}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <>
            {replyable.length ? <button type="button" className="fc-batch-open" data-hpd-smoke="fc-batch-open" onClick={() => startBatch(batchRows("record").length ? "record" : "all")}>✉ Reply to many at once ({replyable.length})</button> : null}
            <ol className="fc-board-list">{open.map(card)}</ol>
          </>
        )}
        {done.length && !batch ? (
          <>
            <button type="button" className="fc-board-done-toggle" data-hpd-smoke="fc-board-done-toggle" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide" : "Show"} done ({done.length})</button>
            {showDone ? <ol className="fc-board-list">{done.map(card)}</ol> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
