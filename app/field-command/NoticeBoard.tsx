"use client";

// The 24 / 72-hour board (owner, 17 Oct 2026): each poor performance notice from vendor tracking with its countdown
// and four steps (reply sent -> paperwork made -> sent to vendor tracking -> confirmed). Steps tick by themselves
// from the emails / paperwork on record, or with a tap. Replies are drafted here; nothing is sent without two taps.
import { useEffect, useRef, useState } from "react";
import { holidaysBetween } from "../../lib/business-days";
import SentPaperwork from "./SentPaperwork";
import HpdMarked from "./HpdMarked";
import type { NoticeFindings } from "../../lib/notice-findings";
import { isNewSince, noticeConvo, type ConvoItem } from "../../lib/notice-convo";
import { plainFix, visitUpdate, vtDay, type PlainFix } from "../../lib/notice-fix";
import { line2Href, usDay, type Line2Fix } from "../../lib/affidavit-line2";
import { BOARD_STEPS, NUDGE_AFTER_DAYS, boardSide, sentTime, daysWaiting, draftNudge, draftReply, hoursLeft, nudgeDays, type BoardRow, type BoardStep } from "../../lib/notice-board";

type Props = {
  focusOmo?: string; // an alert's job: scrolled to and highlighted (21 Oct)
  rows: BoardRow[];
  addressOf: (omo: string) => string;
  hasJob: (omo: string) => boolean;
  onOpenJob: (omo: string) => void;
  onOpenThread: (threadId: string, title: string) => void;
  onMark: (key: string, step: BoardStep, on: boolean) => void;
  onClose: () => void;
  initialShow?: "all" | "ppn" | "docs";
  findingsOf?: (row: BoardRow) => NoticeFindings; // what the app already has for the job (a head start)
  onScan?: () => void;                              // "Check my emails now"
  scanStatus?: string;
  locked?: boolean; // your HPD emails couldn't be opened (signed out): say so instead of showing zeros
  scanChanged?: { omo: string; now: string }[];     // notices the check just updated
  autoReplyOmo?: string;                            // "answer the notice for …" by voice: open its AI reply right away
  onHandled?: (omo: string, on: boolean) => void;   // ✅ "Already sent / fixed" (5 Nov), on every phone
  factsOf?: (omo: string) => JobFacts | null;       // the job itself: address, work, award, HPD's status (6 Nov)
  visitOf?: (omo: string) => string;                // the next visit set for the job (yyyy-mm-dd), or "" (9 Nov)
  awardOf?: (omo: string) => string;                // the job's award date as HPD wrote it ("09/04/26")
  line2?: Line2Fix[];                               // affidavits sent with the wrong line 2 date (9 Nov)
};
// The job on each notice (owner, 6 Nov: "I don't see the work order number, the address, everything is missing ...
// I don't want to see the conversations, that's for you to analyze").
export type JobFacts = { address: string; borough: string; amount: string; awarded: string; work: string; hpd: string; call?: string };

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

// Email leftovers out of HPD's words: inline-image tags like [cid:…] and extra spaces.
const noJunk = (t: string) => String(t || "").replace(/\[cid:[^\]]*\]/gi, " ").replace(/\s+/g, " ").trim();

export default function NoticeBoard({ line2 = [], awardOf, visitOf, factsOf, onHandled, autoReplyOmo = "", locked = false, focusOmo = "", rows, addressOf, hasJob, onOpenJob, onOpenThread, onMark, onClose, initialShow = "all", findingsOf, onScan, scanStatus = "", scanChanged = [] }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!focusOmo) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-hpd-smoke="fc-board-row"][data-omo="${focusOmo}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: "smooth" }); // the top of the card (cards are tall with the conversation)
      el.classList.add("is-focus");
      window.setTimeout(() => el.classList.remove("is-focus"), 4000);
    }, 350);
    // Again once the cards above have filled in (they grow as the emails and records load), so it stays on screen.
    const t2 = window.setTimeout(() => document.querySelector(`[data-hpd-smoke="fc-board-row"][data-omo="${focusOmo}"]`)?.scrollIntoView({ block: "start" }), 1600);
    return () => { window.clearTimeout(t); window.clearTimeout(t2); };
  }, [focusOmo, rows.length]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  const [showDone, setShowDone] = useState(false);
  const [handledArmed, setHandledArmed] = useState("");
  // When you last looked at each notice (this phone): what came in since is highlighted NEW. Saved a few seconds after
  // the board opens, so the highlight stays while you read.
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => {
    let before: Record<string, string> = {};
    try { before = JSON.parse(localStorage.getItem("hpd-board-seen") || "{}"); } catch { /* private mode */ }
    setSeen(before);
    const t = window.setTimeout(() => {
      const at = new Date().toISOString();
      const next = { ...before, ...Object.fromEntries(rows.map((r) => [r.key, at])) };
      try { localStorage.setItem("hpd-board-seen", JSON.stringify(next)); } catch { /* private mode */ }
    }, 5000);
    return () => window.clearTimeout(t);
  }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const proofText = (it: ConvoItem) => {
    const when = it.at ? new Date(it.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    if (it.side === "theirs") return when ? `in your email ${when}` : "";
    return it.proof === "email" ? `✔ Verified: found in your sent email${when ? ` ${when}` : ""}` : it.proof === "app" ? `✔ Made in the app${when ? ` ${when}` : ""}` : it.proof === "you" ? `Marked by you${when ? ` ${when}` : ""}` : when;
  };
  const convo = (row: BoardRow) => {
    const items = noticeConvo(row);
    const seenAt = seen[row.key] || "";
    return (
      <ol className="fc-convo" data-hpd-smoke="fc-convo" aria-label={`Conversation with ${row.who}`}>
        {items.map((it) => {
          const fresh = isNewSince(it, seenAt);
          return (
            <li key={it.id} className={`fc-convo-msg is-${it.side}${fresh ? " is-new" : ""}${it.proof === "you" ? " is-unverified" : ""}`} data-hpd-smoke={`fc-convo-${it.id}`} data-proof={it.proof}>
              <b><span aria-hidden="true">{it.icon}</span> {it.title}{fresh ? <em className="fc-convo-new" data-hpd-smoke="fc-convo-new">NEW</em> : null}</b>
              {it.detail ? <small className="fc-convo-detail">{it.detail}</small> : null}
              {it.file ? <small className="fc-convo-file" data-hpd-smoke="fc-convo-file">📎 {it.file}</small> : null}
              {proofText(it) ? <small className="fc-convo-proof">{proofText(it)}</small> : null}
              {it.id === "sent" && it.proof === "email" ? <SentPaperwork omo={row.omo} /> : null}
            </li>
          );
        })}
      </ol>
    );
  };
  // Reply to many (17 Oct): every reply written on one screen; each one still goes out with its own two taps.
  type Pick = "overdue" | "record" | "none" | "all" | "nudge";
  type BatchItem = { key: string; subject: string; text: string; armed: boolean; status: string; sent: boolean };
  const [batch, setBatch] = useState<{ pick: Pick; items: BatchItem[]; selfStatus: string } | null>(null);
  const [reply, setReply] = useState<{ key: string; to: string; subject: string; text: string; armed: boolean; status: string; nudge?: boolean } | null>(null);
  // When we last asked them to confirm, per row (this phone): the no-answer clock starts again from there.
  const [nudged, setNudged] = useState<Record<string, string>>({});
  useEffect(() => { try { setNudged(JSON.parse(localStorage.getItem("hpd-notice-nudged") || "{}")); } catch { /* private mode */ } }, []);
  const markNudged = (key: string) => setNudged((m) => { const next = { ...m, [key]: new Date().toISOString() }; try { localStorage.setItem("hpd-notice-nudged", JSON.stringify(next)); } catch { /* private mode */ } return next; });
  const quiet = (r: BoardRow) => nudgeDays(r, now, nudged[r.key]);
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
  // To send / Sent · waiting / They replied (owner, 22 Oct): a job moves to Sent the moment you send it.
  const [side, setSide] = useState<"tosend" | "waiting" | "replied">(() => {
    const f = focusOmo ? rows.find((r) => r.omo === focusOmo && r.next) : undefined;
    return f ? (boardSide(f) as "tosend" | "waiting" | "replied") : "tosend";
  });
  // An alert's link (focusOmo): once its notice has loaded, show the tab it's on (or the done list), so it's on screen.
  // The notices can arrive after the board opens, so this waits for them (8 Nov: a link landed on To send without it).
  const focusShown = useRef("");
  useEffect(() => {
    if (!focusOmo || focusShown.current === focusOmo) return;
    const f = rows.find((r) => r.omo === focusOmo);
    if (!f) return;
    focusShown.current = focusOmo;
    if (show !== "all" && f.kind !== show) setShow("all");
    if (f.next) setSide(boardSide(f) as "tosend" | "waiting" | "replied");
    else setShowDone(true);
  }, [focusOmo, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  // next: the notice the board moved on to by itself after a reply went out (owner, 23 Oct: "everything needs to flow
  // auto"); "Back to" scrolls to the one just answered.
  const [moved, setMoved] = useState<{ omo: string; to: string; next?: string } | null>(null);
  const movedToSent = (omo: string, to: string) => setMoved({ omo, to });
  const scrollToRow = (omo: string) => window.setTimeout(() => {
    const el = document.querySelector(`[data-hpd-smoke="fc-board-row"][data-omo="${omo}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    el.classList.add("is-focus");
    window.setTimeout(() => el.classList.remove("is-focus"), 4000);
  }, 250);
  const open = shown.filter((r) => r.next);
  const onSide = open.filter((r) => boardSide(r) === side);
  const done = shown.filter((r) => !r.next);
  const under6 = open.filter((r) => !r.steps.sent.done && hoursLeft(r, now) < 6 && hoursLeft(r, now) >= 0).length;
  const overdue = open.filter((r) => !r.steps.sent.done && hoursLeft(r, now) < 0).length;
  const waiting = open.filter((r) => r.next === "confirmed").length;

  // By voice (22 Oct "answer the notice for ER01987"): that row on screen, its AI reply being written. Sending still
  // takes the two taps.
  const autoDone = useRef("");
  useEffect(() => {
    if (!autoReplyOmo || autoDone.current === autoReplyOmo) return;
    const row = rows.find((r) => r.omo === autoReplyOmo && r.next);
    if (!row) return;
    autoDone.current = autoReplyOmo;
    const sideOf = boardSide(row);
    if (sideOf !== "done") setSide(sideOf);
    setShow("all");
    const d = draftReply(row, addressOf(row.omo));
    setReply({ key: row.key, to: row.to, subject: d.subject, text: d.text, armed: false, status: "" });
    void writeWithAi(row, "");
  }, [autoReplyOmo, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      movedToSent(row.omo, d.to);
      if (reply.nudge) markNudged(row.key);
      setReply({ ...reply, armed: false, status: reply.nudge ? `✓ Sent to ${d.to}. The card waits ${NUDGE_AFTER_DAYS} more days before asking again.` : `✓ Sent to ${d.to}.` });
      // A moment to see "Sent", then on to the next notice still to answer (due soonest), its reply being written.
      // Nothing goes out without its own two taps.
      const sentTo = d.to;
      if (reply.nudge) return; // a follow-up on a sent one: stay on it
      window.setTimeout(() => {
        const next = rows
          .filter((r) => r.key !== row.key && r.next && boardSide(r) === "tosend" && r.to)
          .sort((a, b) => hoursLeft(a, Date.now()) - hoursLeft(b, Date.now()))[0];
        setMoved({ omo: row.omo, to: sentTo, next: next?.omo });
        if (!next) return;
        setSide("tosend");
        const a = addressOf(next.omo);
        const dr = draftReply(next, a);
        setReply({ key: next.key, to: next.to, subject: dr.subject, text: dr.text, armed: false, status: "" });
        void writeWithAi(next, "");
        scrollToRow(next.omo);
      }, 2000);
    } catch (e) {
      setReply({ ...reply, armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}. Nothing went out.` });
    }
  };

  // Who can get a reply now: open, their address known, not already waiting on them.
  const replyable = rows.filter((r) => r.next && r.next !== "confirmed" && r.to);
  // Answer a whole missing-documents list in one email (owner, 19 Oct: "Gafur... very important, let's get her updated"):
  // one line per job with what's on record (sent on <date> / PDFs emailed / photos) or that it's coming.
  const lists = [...new Set(rows.filter((r) => r.kind === "docs").map((r) => r.threadId))].map((tid) => rows.filter((r) => r.kind === "docs" && r.threadId === tid)).sort((a, b) => b.length - a.length || Date.parse(b[0].noticeAt) - Date.parse(a[0].noticeAt)); // her biggest, newest list first
  const [listReply, setListReply] = useState<{ threadId: string; to: string; who: string; subject: string; text: string; armed: boolean; status: string; sent: boolean } | null>(null);
  const startListReply = (list: BoardRow[]) => {
    const head = list[0];
    const first = (head.who || "").split(/\s+/)[0] || "";
    const lineFor = (r: BoardRow) => {
      const f = findingsOf ? findingsOf(r) : null;
      const sentLine = f?.lines.find((l) => /sent to HPD on|emailed them PDFs/.test(l.text))?.text || "";
      const when = (sentLine.match(/on (\d+\/\d+\/\d+)/) || [])[1] || "";
      const what = /photo/i.test(r.want) ? "photos" : /affidavit|invoice/i.test(r.want) ? "affidavit and invoice" : "documents";
      // She asked for photos: a PDF sent before isn't photos (EO18305: "photos sent on 8/19" was an affidavit). You say.
      if (what === "photos" && !r.steps.sent.done) return `${r.omo} (${r.want}) - update: `;
      if (r.filed) return `${r.omo} (${r.want}) - ${what} sent on ${new Date(r.filed.at).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}.`;
      if (r.steps.sent.done || when) return `${r.omo} (${r.want}) - ${what} sent${when ? ` on ${when}` : ""}. We will send them again to you today.`;
      if (f?.advice.action === "make") return `${r.omo} (${r.want}) - ${f.lines.find((l) => /from your app/.test(l.text))?.text.replace(" (from your app)", "") || "work done"}; the affidavit and invoice will be sent to you shortly.`;
      return `${r.omo} (${r.want}) - update: `;
    };
    const lines = list.map(lineFor);
    setListReply({ threadId: head.threadId, to: head.to, who: head.who, armed: false, status: "", sent: false,
      subject: `RE: ${head.subject}`.slice(0, 200),
      text: `Hello${first ? ` ${first}` : ""},\n\nThank you for the list. Here is where each job stands:\n\n${lines.join("\n")}\n\nPlease let us know if anything else is needed.\n\nThank you,\nJot Singh\nUnited Angel Construction Corp` });
  };
  const sendListReply = async (toSelf: boolean) => {
    if (!listReply) return;
    if (!toSelf && !listReply.armed) { setListReply({ ...listReply, armed: true }); return; }
    if (!toSelf && /update: \n/.test(listReply.text + "\n")) { setListReply({ ...listReply, armed: false, status: "Fill in the lines that end with \"update:\" first (or delete them)." }); return; }
    setListReply({ ...listReply, status: "Sending…" });
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toSelf ? { toSelf: true, subject: listReply.subject, text: listReply.text } : { to: listReply.to, subject: listReply.subject, text: listReply.text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      if (toSelf) { setListReply({ ...listReply, armed: false, status: `✓ Sent to you (${d.to}). Nothing went to HPD.` }); return; }
      for (const row of rows.filter((x) => x.threadId === listReply.threadId)) onMark(row.key, "replied", true);
      movedToSent(`${rows.filter((x) => x.threadId === listReply.threadId).length} jobs on the list`, d.to);
      setListReply({ ...listReply, armed: false, sent: true, status: `✓ Sent to ${d.to}. Every job on the list shows Reply sent.` });
    } catch (e) {
      setListReply({ ...listReply, armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}. Nothing went out.` });
    }
  };
  const noAnswer = rows.filter((r) => r.to && quiet(r) > 0).sort((a, b) => quiet(b) - quiet(a));
  // 🔥 Every overdue notice with nothing sent (owner, 9 Nov: "all the overdue notices, we need to fix them ... reply back to
  // Lewis, let her know what's going on, especially with the appointments"): most overdue first.
  const overdueRows = rows.filter((r) => r.next && r.to && r.kind === "ppn" && !r.steps.sent.done && hoursLeft(r, now) < 0).sort((a, b) => hoursLeft(a, now) - hoursLeft(b, now));
  const batchDraft = (pick: Pick, r: BoardRow) => {
    const a = addressOf(r.omo);
    if (pick === "nudge") return draftNudge(r, a);
    const vd = visitOf?.(r.omo) || "";
    return pick === "overdue" && vd && !r.problem ? visitUpdate(r, a, vtDay(vd)) : draftReply(r, a);
  };
  const batchRows = (pick: Pick) => pick === "overdue" ? overdueRows : pick === "nudge" ? noAnswer : replyable.filter((r) => pick === "all" || (pick === "record" ? !!r.sentAt || r.steps.made.done : !r.sentAt && !r.steps.made.done));
  const startBatch = (pick: Pick) => setBatch({ pick, selfStatus: "", items: batchRows(pick).map((r) => { const d = batchDraft(pick, r); return { key: r.key, subject: d.subject, text: d.text, armed: false, status: "", sent: false }; }) });
  const setItem = (key: string, patch: Partial<BatchItem>) => setBatch((b) => (b ? { ...b, items: b.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) } : b));
  const sendItem = async (row: BoardRow, it: BatchItem) => {
    if (!it.armed) { setItem(it.key, { armed: true }); return; }
    setItem(it.key, { status: "Sending…" });
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: row.to, subject: it.subject, text: it.text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      onMark(row.key, "replied", true);
      if (batch?.pick === "nudge") markNudged(row.key);
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

  // 👉 Do this (owner, 9 Nov: "tell me just very easily: go here, fix this"): one plain line and one button on every
  // open notice; HPD's fix notes as short steps. The rest of the card folds under "Details".
  const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "numeric", day: "numeric" });
  const openReply = (row: BoardRow, address: string, note = "", text = "") => {
    const d = draftReply(row, address);
    setReply({ key: row.key, to: row.to, subject: d.subject, text: text || d.text, armed: false, status: "" });
    if (!text) void writeWithAi(row, note);
  };
  const fixHref = (row: BoardRow) => `/paperwork/?job=${encodeURIComponent(row.omo)}&fix=${encodeURIComponent(row.problem?.at || "")}&reason=${encodeURIComponent(noJunk(row.problem?.text || "").slice(0, 280))}&auto=1${row.to ? "&vt=1" : ""}${row.problem?.pdf ? `&marked=${encodeURIComponent(row.problem.threadId || row.threadId)}` : ""}`;
  const doThis = (row: BoardRow, address: string) => {
    if (!row.next || (row.next === "confirmed" && !row.problem)) return null; // waiting / no answer: the line further down says it
    const vd = visitOf?.(row.omo) || "";
    const fx: PlainFix | null = plainFix(row, { now, visit: vd ? shortDay(vd) : "", award: awardOf?.(row.omo) || "" });
    if (!fx) return null;
    const btn = fx.action === "correct" || fx.action === "resend" ? <a className="fc-board-do-go" data-hpd-smoke="fc-board-do-go" href={fixHref(row)} onClick={() => rememberSend(row)}>{fx.button}</a>
      : fx.action === "photos" || fx.action === "send" ? <a className="fc-board-do-go" data-hpd-smoke="fc-board-do-go" href={paperHref(row, "")} onClick={() => rememberSend(row)}>{fx.button}</a>
      : fx.action === "visit" ? <button type="button" className="fc-board-do-go" data-hpd-smoke="fc-board-do-go" onClick={() => { const v = visitUpdate(row, address, vtDay(vd)); openReply(row, address, "", v.text); }}>{fx.button}</button>
      : fx.action === "reply" ? <button type="button" className="fc-board-do-go" data-hpd-smoke="fc-board-do-go" onClick={() => openReply(row, address, row.filed ? `Our affidavit and invoice for ${row.omo} were emailed on ${day(row.filed.at)} (${row.filed.name}). Tell them that date; don't attach it again.` : "")}>{fx.button}</button>
      : null;
    return (
      <div className={`fc-board-do is-${fx.tone}`} data-hpd-smoke="fc-board-do" data-action={fx.action}>
        <p>👉 {fx.headline}</p>
        {fx.steps.length ? <ol data-hpd-smoke="fc-board-fix-steps">{fx.steps.map((t, i) => <li key={i}>{t}</li>)}</ol> : null}
        {/* "open the document and look at it" (9 Nov): what you sent, right here, next to their fix notes. */}
        {row.problem?.pdf ? <HpdMarked threadId={row.problem.threadId || row.threadId} name={row.problem.pdf} /> : null}
        {fx.action === "correct" || fx.action === "resend" ? <SentPaperwork omo={row.omo} /> : null}
        {fx.action === "paperwork" ? <div className="fc-prio-outcomes">{OUTCOMES.map(([k, label]) => <a key={k} href={paperHref(row, k)} onClick={() => rememberSend(row)} data-hpd-smoke={`fc-board-outcome-${k}`}>{label}</a>)}</div> : btn}
        {vd && fx.action !== "visit" && !row.steps.sent.done ? <button type="button" className="fc-board-do-visit" data-hpd-smoke="fc-board-do-visit" onClick={() => { const v = visitUpdate(row, address, vtDay(vd)); openReply(row, address, "", v.text); }}>📅 You go {shortDay(vd)}: tell {/lewis/i.test(row.who) ? "Lewis" : (row.who || "them").split(/\s+/)[0]}</button> : null}
      </div>
    );
  };
  const card = (row: BoardRow) => {
    const h = hoursLeft(row, now);
    const late = !row.steps.sent.done && h < 0;
    const hot = !row.steps.sent.done && h < 6;
    const address = addressOf(row.omo);
    // Green: sent / fixed / done. Red: nothing went yet (or HPD found a problem with it).
    const ok = !row.next || row.steps.sent.done;
    return (
      <li key={row.key} className={`fc-board-row ${row.kind === "docs" ? "is-docs" : `is-${row.hours}h`}${hot ? " is-hot" : ""}${late ? " is-late" : ""}${row.next ? "" : " is-done"}${ok ? " is-ok" : " is-todo"}${row.next ? ` side-${boardSide(row)}` : ""}`} data-hpd-smoke="fc-board-row" data-omo={row.omo} data-next={row.next || "done"} data-state={ok ? "ok" : "todo"}>
        <div className="fc-board-top">
          {ok ? <span className="fc-board-okmark" aria-hidden="true">✓</span> : row.kind === "ppn" ? <span className="fc-fire" aria-hidden="true">🔥</span> : null}
          <span className="fc-board-clock" data-hpd-smoke="fc-board-clock">{row.next ? (boardSide(row) === "replied" ? `💬 ${(row.who || "They").split(/\s+/)[0]} replied ${day(row.lastTheirsAt)}` : boardSide(row) === "waiting" ? `📤 Sent ${day(new Date(sentTime(row)).toISOString())} · waiting ${Math.max(0, Math.floor((now - sentTime(row)) / 86400000))} d` : row.steps.sent.done ? "📤 Sent · waiting" : row.kind === "docs" ? `📋 Waiting ${daysWaiting(row, now)} days` : `⏱ ${clock(h)}`) : "✅ Done"}</span>
          <span className="fc-board-kind">{row.kind === "docs" ? "AEP · MISSING DOCS" : `ERP · ${row.hours}-HOUR`}</span>
        </div>
        <p className="fc-board-job"><b>{row.omo}</b>{address ? <span className="fc-board-addr">{address}</span> : null}</p>
        {doThis(row, address)}
        {row.kind !== "docs" && row.dueAt && row.next && !row.steps.sent.done ? (() => {
          const hol = holidaysBetween(row.noticeAt, row.dueAt);
          return <p className="fc-board-due" data-hpd-smoke="fc-board-due">Due <b>{new Date(row.dueAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>{hol.length ? <span className="fc-board-hol"> · 🗓 {hol.join(", ")} not counted</span> : null}</p>;
        })() : null}
        {row.kind === "docs" ? <p className="fc-board-want" data-hpd-smoke="fc-board-want">They want: <b>{row.want}</b></p> : null}
        {row.handledAt && !row.next ? <p className="fc-board-heard" data-hpd-smoke="fc-board-handled-note">✅ You marked it sent / fixed {day(row.handledAt)}{onHandled ? <> · <button type="button" className="fc-board-undo" data-hpd-smoke="fc-board-handled-undo" onClick={() => onHandled(row.omo, false)}>Undo</button></> : null}</p> : null}
        <details className="fc-board-more" data-hpd-smoke="fc-board-more">
        <summary>📋 Details · steps · emails</summary>
        {(() => {
          const f = factsOf?.(row.omo);
          if (!f) return null;
          const money = Number(f.amount) ? `$${Number(f.amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "";
          return (
            <dl className="fc-board-facts" data-hpd-smoke="fc-board-facts">
              {f.borough ? <div><dt>🏠 Borough</dt><dd>{f.borough}</dd></div> : null}
              {money || f.awarded ? <div><dt>💵 Award</dt><dd>{[money, f.awarded ? `awarded ${f.awarded}` : ""].filter(Boolean).join(" · ")}</dd></div> : null}
              {f.work ? <div><dt>🔧 Work</dt><dd>{f.work.length > 150 ? `${f.work.slice(0, 150)}…` : f.work}</dd></div> : null}
              {f.call ? <div><dt>☎️ HPD call</dt><dd data-hpd-smoke="fc-board-call">{f.call}</dd></div> : null}
              <div><dt>🏛 HPD</dt><dd data-hpd-smoke="fc-board-hpd">{f.hpd ? `Closed it: ${f.hpd}` : "Still open"}</dd></div>
            </dl>
          );
        })()}
        {row.problem && row.next ? <p className="fc-board-problem" data-hpd-smoke="fc-board-problem">⚠️ {(row.who || "HPD").split(/\s+/)[0]} wrote {day(row.problem.at)}: “{noJunk(row.problem.text)}” Fix it with the same dates as the original and send it again, or tap ✅ if you already did.</p> : null}
        {row.answered && !row.problem ? <p className="fc-board-heard" data-hpd-smoke="fc-board-heard">✅ {(row.who || "HPD").split(/\s+/)[0]} answered {day(row.answered.at)}: “{noJunk(row.answered.text).slice(0, 120)}”</p> : null}
        <details className="fc-board-emails" data-hpd-smoke="fc-board-emails"><summary>💬 The emails</summary>{convo(row)}</details>
        <p className="fc-board-from">From {row.who} · {day(row.noticeAt)}{row.followUpAt ? ` · followed up ${day(row.followUpAt)}` : ""}{row.sentAt ? ` · paperwork on record ${day(row.sentAt)}` : ""}</p>
        {row.filed ? <p className="fc-board-filed" data-hpd-smoke="fc-board-filed">📎 Already emailed <b>{day(row.filed.at)}</b>: {row.filed.name}{row.filed.here ? "" : " (in another email)"}. Don&apos;t send it again; tell them the date.</p> : null}
        {row.next && findingsOf ? (() => {
          const f = findingsOf(row);
          return (
            <div className="fc-found" data-hpd-smoke="fc-found">
              <b>🔎 Found on record</b>
              <ul>{f.lines.map((l, i) => <li key={i} className={`is-${l.tone}`}><span aria-hidden="true">{l.icon}</span> {l.text}</li>)}</ul>
              {/* The file you sent opens from the 📤 message above when it is in your sent email; otherwise here. */}
              {!(row.filed || row.steps.sent.how === "email") && (f.lines.some((l) => /sent to HPD on|emailed them PDFs|paperwork on record/i.test(l.text)) || row.sentAt || row.steps.sent.done) ? <SentPaperwork omo={row.omo} /> : null}
              {/* Its PDF already went out (in her thread or another): tell them the date, don't send it again. */}
              <p className="fc-found-next" data-hpd-smoke="fc-found-next">👉 {row.filed ? `Already emailed ${day(row.filed.at)}${row.filed.here ? "" : " (in another email)"}: reply with that date. No need to send it again.` : f.advice.text}</p>
              {row.filed ? <button type="button" className="fc-found-go" data-hpd-smoke="fc-found-go" onClick={() => { const d = draftReply(row, address); setReply({ key: row.key, to: row.to, subject: d.subject, text: d.text, armed: false, status: "" }); void writeWithAi(row, `Our affidavit and invoice for ${row.omo} were emailed on ${day(row.filed!.at)} (${row.filed!.name}). Tell them that date; don't attach it again.`); }}>✨ Tell them it went {day(row.filed.at)}</button>
              : f.advice.action === "resend" ?<a className="fc-found-go" data-hpd-smoke="fc-found-go" href={paperHref(row, "")} onClick={() => rememberSend(row)}>📤 Open the paperwork and send it</a>
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
        </details>
        {row.next === "confirmed" && quiet(row) ? (
          <div className="fc-board-quiet" data-hpd-smoke="fc-board-quiet">
            <p>⏰ No answer in <b>{quiet(row)} days</b>{nudged[row.key] ? ` (asked again ${day(nudged[row.key])})` : ""}. Ask them to confirm they got it, or tap ✅ if they did.</p>
            {row.to ? <button type="button" data-hpd-smoke="fc-board-nudge" onClick={() => { const d = draftNudge(row, address); setReply({ key: row.key, to: row.to, subject: d.subject, text: d.text, armed: false, status: "", nudge: true }); }}>⏰ Ask them to confirm</button> : null}
          </div>
        ) : row.next === "confirmed" ? <p className="fc-board-todo">Waiting for them to confirm. Tap ✅ when they do.</p> : null}
        <div className="fc-notice-actions">
          {row.next && onHandled ? <button type="button" className={`fc-board-handled${handledArmed === row.key ? " is-armed" : ""}`} data-hpd-smoke="fc-board-handled" onClick={() => { if (handledArmed !== row.key) { setHandledArmed(row.key); return; } setHandledArmed(""); onHandled(row.omo, true); }}>{handledArmed === row.key ? "✅ Tap again: it's sent / fixed" : "✅ Already sent / fixed"}</button> : null}
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
            {reply.status ? <p className={`fc-ack-status${reply.status.startsWith("✓") ? " is-ok" : ""}`}>{reply.status === "Sending…" ? <><span className="hpd-spin" aria-hidden="true" /> Sending<span className="hpd-dots" /></> : reply.status}</p> : null}
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
        {onScan ? (
          <div className="fc-scan" data-hpd-smoke="fc-scan">
            <button type="button" data-hpd-smoke="fc-scan-btn" disabled={scanStatus === "Checking your email…"} onClick={onScan}>{scanStatus === "Checking your email…" ? <><span className="hpd-spin" aria-hidden="true" /> Checking your email<span className="hpd-dots" /></> : "🔄 Check my emails now"}</button>
            {scanStatus && scanStatus !== "Checking your email…" ? <p data-hpd-smoke="fc-scan-status">{scanStatus}</p> : <small>Reads your sent replies and HPD&apos;s answers (last 7 days) and updates the steps right away.</small>}
            {scanChanged.length ? <ul data-hpd-smoke="fc-scan-changed">{scanChanged.map((c) => <li key={c.omo}><b>{c.omo}</b> {c.now}</li>)}</ul> : scanStatus.startsWith("✓") ? <small>No notice changed: everything was already up to date.</small> : null}
          </div>
        ) : null}
        <div className="fc-board-filter" role="tablist" data-hpd-smoke="fc-board-filter">
          {([["all", "All", rows.filter((r) => r.next).length], ["ppn", "🚨 Lewis · ERP 24/72 h", rows.filter((r) => r.next && r.kind === "ppn").length], ["docs", "🏛 Gafur · AEP", rows.filter((r) => r.next && r.kind === "docs").length]] as const).map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? "is-on" : ""} data-hpd-smoke={`fc-board-show-${k}`} onClick={() => setShow(k)}>{label} <b>{n}</b></button>
          ))}
        </div>
        <div className="fc-board-sides" role="tablist" data-hpd-smoke="fc-board-sides">
          {([["tosend", "📝 To send"], ["waiting", "📤 Sent · waiting"], ["replied", "💬 They replied"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={side === k} className={`is-${k}${side === k ? " is-on" : ""}`} data-hpd-smoke={`fc-board-side-${k}`} onClick={() => { setSide(k); setMoved(null); }}>{label} <b>{open.filter((r) => boardSide(r) === k).length}</b></button>
          ))}
        </div>
        {moved ? (
          <p className="fc-board-moved" role="status" data-hpd-smoke="fc-board-moved">
            ✓ Sent to {moved.to}. <b>{moved.omo}</b> moved to 📤 Sent · waiting.{moved.next ? <> Next: <b data-hpd-smoke="fc-board-next">{moved.next}</b>, its reply is being written.</> : null}
            {moved.next ? <button type="button" data-hpd-smoke="fc-board-come-back" onClick={() => { const o = moved.omo; const r = rows.find((x) => x.omo === o && x.next); const sd = r ? boardSide(r) : "waiting"; setReply(null); setSide(sd === "done" ? "waiting" : sd); setMoved(null); scrollToRow(o); }}>↩ Back to {moved.omo}</button>
              : side !== "waiting" ? <button type="button" data-hpd-smoke="fc-board-moved-go" onClick={() => { setSide("waiting"); setMoved(null); }}>See it</button> : null}
          </p>
        ) : null}
        {line2.length ? (
          <details className="fc-line2" data-hpd-smoke="fc-line2" open={line2.length <= 3}>
            <summary>🗓 <b>{line2.length}</b> affidavit{line2.length === 1 ? "" : "s"} sent with the wrong date on line 2 · fix {line2.length === 1 ? "it" : "them"}</summary>
            <p>Line 2 (&quot;That on ___ I was directed by HPD&quot;) must be the <b>Confirmation of Award date</b>, not the work date. HPD sends them back for it (ER04312).</p>
            <ol>
              {line2.map((f) => (
                <li key={f.omo} data-hpd-smoke="fc-line2-row" data-omo={f.omo}>
                  <b>{f.omo}</b> <span>says {usDay(f.sent)}{f.workDate ? " (work date)" : ""} → <b>{usDay(f.award)}</b> award{f.sentAt ? ` · sent ${day(f.sentAt)}` : ""}</span>
                  <a href={`${line2Href(f, new Date().toISOString().slice(0, 10))}&auto=1`} data-hpd-smoke="fc-line2-fix">✨ Auto-fix it now</a>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <div className="fc-board-sum" data-hpd-smoke="fc-board-sum">
          <span><b>{open.length}</b> open</span>
          <span className={overdue ? "is-late" : ""}><b>{overdue}</b> overdue</span>
          {open.some((r) => r.problem) ? <span className="is-late" data-hpd-smoke="fc-board-fix-count"><b>{open.filter((r) => r.problem).length}</b> to fix</span> : null}
          <span className={under6 ? "is-hot" : ""}><b>{under6}</b> under 6 h</span>
          <span className={shown.some((r) => noAnswer.includes(r)) ? "is-quiet" : ""}><b>{waiting}</b> waiting on them{shown.some((r) => noAnswer.includes(r)) ? <small data-hpd-smoke="fc-board-quiet-count">⏰ {shown.filter((r) => noAnswer.includes(r)).length} no answer</small> : null}</span>
        </div>
        <details className="fc-board-how"><summary>ⓘ How the steps work</summary><p className="fc-follow-note">Each notice and missing-documents request from vendor tracking until it&apos;s confirmed: ✉ reply → 📄 paperwork → 📤 sent → ✅ confirmed. Steps tick by themselves from your emails and the paperwork on record; tap a step to tick it by hand.</p></details>
        {locked ? (
          <form className="fc-board-locked" method="post" action="/api/drive/start?back=%2Fmap%2F%3Fview%3Dall%26map%3D1%26board%3D1" data-hpd-smoke="fc-board-locked">
            <b>🔒 Your HPD emails didn&apos;t open on this phone</b>
            <span>The Google sign-in ran out. Sign in again and the notices, Gafur&apos;s lists and your replies come back here.</span>
            <button type="submit">Sign in with Google</button>
          </form>
        ) : !rows.length ? <p className="fc-follow-note">Nothing from vendor tracking here right now. 🎉</p> : null}
        {batch ? (
          <section className="fc-batch" data-hpd-smoke="fc-batch">
            <div className="fc-batch-head">
              <button type="button" data-hpd-smoke="fc-batch-back" onClick={() => setBatch(null)}>← Back to the board</button>
              <b data-hpd-smoke="fc-batch-count">{batch.items.filter((i) => i.sent).length} of {batch.items.length} sent</b>
            </div>
            <div className="fc-board-filter" role="tablist">
              {([["overdue", "🔥 Overdue"], ["record", "Paperwork on record"], ["none", "No paperwork yet"], ["all", "All"], ["nudge", "⏰ No answer"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={batch.pick === k} className={batch.pick === k ? "is-on" : ""} data-hpd-smoke={`fc-batch-pick-${k}`} onClick={() => startBatch(k)}>{label} <b>{batchRows(k).length}</b></button>
              ))}
            </div>
            <p className="fc-follow-note">Every reply is written. Read each one; fix anything; then Send (two taps) one by one. Or send them all to yourself first in one email.</p>
            <button type="button" className="fc-batch-self" data-hpd-smoke="fc-batch-self" disabled={!batch.items.length || batch.selfStatus === "Sending…"} onClick={() => void sendAllToMe()}>📨 Send all {batch.items.length} to me first (one email)</button>
            {batch.selfStatus ? <p className="fc-ack-status" data-hpd-smoke="fc-batch-self-status">{batch.selfStatus === "Sending…" ? <><span className="hpd-spin" aria-hidden="true" /> Sending<span className="hpd-dots" /></> : batch.selfStatus}</p> : null}
            {!batch.items.length ? <p className="fc-follow-note">No replies to write here.</p> : null}
            <ol className="fc-batch-list">
              {batch.items.map((it, i) => {
                const row = rows.find((r) => r.key === it.key);
                if (!row) return null;
                return (
                  <li key={it.key} className={it.sent ? "is-sent" : ""} data-hpd-smoke="fc-batch-item">
                    <p className="fc-batch-to"><b>{i + 1}. {row.omo}</b> · to {row.who} &lt;{row.to}&gt; · {row.kind === "docs" ? `missing docs (${row.want})` : `${row.hours}-hour notice`}{batch.pick === "overdue" ? <em className="fc-batch-late"> · {clock(hoursLeft(row, now))}{visitOf?.(row.omo) ? ` · you go ${shortDay(visitOf(row.omo))}` : ""}</em> : null}</p>
                    <input aria-label="Subject" value={it.subject} disabled={it.sent} onChange={(e) => setItem(it.key, { subject: e.target.value, armed: false })} />
                    <textarea aria-label="Message" rows={7} value={it.text} disabled={it.sent} data-hpd-smoke="fc-batch-text" onChange={(e) => setItem(it.key, { text: e.target.value, armed: false })} />
                    <button type="button" className={it.sent ? "is-sent" : it.armed ? "is-armed" : ""} disabled={it.sent || it.status === "Sending…"} data-hpd-smoke="fc-batch-send" onClick={() => void sendItem(row, it)}>{it.sent ? "✓ Sent" : it.armed ? `✅ Tap again: send to ${row.to}` : "✉ Send"}</button>
                    {it.status ? <p className={`fc-ack-status${it.status.startsWith("✓") ? " is-ok" : ""}`} data-hpd-smoke="fc-batch-status">{it.status === "Sending…" ? <><span className="hpd-spin" aria-hidden="true" /> Sending<span className="hpd-dots" /></> : it.status}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <>
            {show === "docs" ? lists.map((list) => (
              <div key={list[0].threadId} className="fc-list-reply" data-hpd-smoke="fc-list-reply">
                <b>📋 {list[0].who}&apos;s list · {list.length} job{list.length === 1 ? "" : "s"} · asked {new Date(list[0].noticeAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}{list[0].followUpAt ? ` · followed up ${new Date(list[0].followUpAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""}</b>
                <small data-hpd-smoke="fc-list-reply-sum">{list.filter((r) => r.filed || r.steps.sent.done).length} already emailed · {list.filter((r) => boardSide(r) === "tosend").length} to send{list.filter((r) => !r.next).length ? ` · ${list.filter((r) => !r.next).length} confirmed` : ""}</small>
                {listReply?.threadId === list[0].threadId ? (
                  <div className="fc-ack" data-hpd-smoke="fc-list-reply-box">
                    <b>One email answering the whole list, to {listReply.who} &lt;{listReply.to}&gt;</b>
                    <p className="fc-ack-status">Lines ending in &quot;update:&quot; need a word from you (what&apos;s happening on that job).</p>
                    <label>Subject<input value={listReply.subject} onChange={(e) => setListReply({ ...listReply, subject: e.target.value, armed: false })} /></label>
                    <label>Message<textarea rows={16} data-hpd-smoke="fc-list-reply-text" value={listReply.text} onChange={(e) => setListReply({ ...listReply, text: e.target.value, armed: false })} /></label>
                    <div className="fc-ack-actions">
                      <button type="button" className={listReply.armed ? "is-armed" : ""} disabled={listReply.sent || !listReply.to || listReply.status === "Sending…"} data-hpd-smoke="fc-list-reply-send" onClick={() => void sendListReply(false)}>{listReply.sent ? "✓ Sent" : listReply.armed ? `✅ Tap again: send to ${listReply.to}` : "✉ Send"}</button>
                      <button type="button" disabled={listReply.status === "Sending…"} data-hpd-smoke="fc-list-reply-me" onClick={() => void sendListReply(true)}>📨 Send to me first</button>
                      <button type="button" onClick={() => setListReply(null)}>Close</button>
                    </div>
                    {listReply.status ? <p className="fc-ack-status" data-hpd-smoke="fc-list-reply-status">{listReply.status === "Sending…" ? <><span className="hpd-spin" aria-hidden="true" /> Sending<span className="hpd-dots" /></> : listReply.status}</p> : null}
                  </div>
                ) : <button type="button" className="fc-batch-open" data-hpd-smoke="fc-list-reply-open" onClick={() => startListReply(list)}>✉ Answer the whole list in one email</button>}
              </div>
            )) : null}
            {overdueRows.length ? <button type="button" className="fc-batch-open is-overdue" data-hpd-smoke="fc-overdue-open" onClick={() => startBatch("overdue")}>🔥 Update all {overdueRows.length} overdue in a row{overdueRows.some((r) => visitOf?.(r.omo)) ? ` (${overdueRows.filter((r) => visitOf?.(r.omo)).length} with the day you go)` : ""}</button> : null}
            {noAnswer.length ? <button type="button" className="fc-batch-open is-nudge" data-hpd-smoke="fc-nudge-open" onClick={() => startBatch("nudge")}>⏰ Ask {noAnswer.length} to confirm (no answer {NUDGE_AFTER_DAYS}+ days)</button> : null}
            {replyable.length ? <button type="button" className="fc-batch-open" data-hpd-smoke="fc-batch-open" onClick={() => startBatch(batchRows("record").length ? "record" : "all")}>✉ Reply to many at once ({replyable.length})</button> : null}
            {!onSide.length ? <p className="fc-follow-note" data-hpd-smoke="fc-board-side-empty">{side === "tosend" ? "Nothing left to send. 🎉" : side === "waiting" ? "Nothing waiting on them." : "No new answers from them."}</p> : null}
            <ol className="fc-board-list">{onSide.map(card)}</ol>
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
