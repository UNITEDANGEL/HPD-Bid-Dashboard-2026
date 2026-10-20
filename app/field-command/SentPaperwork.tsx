"use client";
// "See what you sent" (owner, 20 Oct: "once you find it was sent before, point me to the paperwork that was sent; I need
// a link to see and confirm, not just the dates"): the emails you sent naming this job with PDFs (from your Gmail,
// read-only), each PDF opened right here (pinch to zoom), plus a link to the email in Gmail.
import { useEffect, useState } from "react";
import ItbPages from "./ItbPages";

type SentEmail = { id: string; threadId: string; at: string; to: string; subject: string; files: { i: number; name: string; size: number }[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
const toWho = (to: string) => to.replace(/<[^>]*>/g, "").replace(/"/g, "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(", ") || to;

export default function SentPaperwork({ omo, light = false }: { omo: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<SentEmail[] | null>(null);
  const [msg, setMsg] = useState("");
  const [shown, setShown] = useState<{ key: string; url: string; name: string } | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => () => { if (shown) URL.revokeObjectURL(shown.url); }, [shown]);

  const load = async () => {
    setOpen(true);
    if (emails) return;
    setMsg("Looking in your sent email…");
    try {
      const r = await fetch("/api/drive/hpd-sent", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ omo }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { setMsg("Sign in with Google on the Storage page to see what you sent."); return; }
      if (!r.ok || !Array.isArray(d.emails)) { setMsg(String(d.error || `Couldn't read your email (HTTP ${r.status}).`)); return; }
      setEmails(d.emails);
      setMsg(d.emails.length ? "" : `No email with a PDF naming ${omo} in your sent mail.`);
    } catch { setMsg("No connection to your email right now."); }
  };
  const openPdf = async (e: SentEmail, f: SentEmail["files"][number]) => {
    const key = `${e.id}|${f.i}`;
    if (shown?.key === key) { setShown(null); return; }
    setBusy(key);
    try {
      const r = await fetch("/api/drive/hpd-sent-pdf", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, i: f.i }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(String(d.error || `HTTP ${r.status}`)); }
      const blob = await r.blob();
      setShown({ key, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })), name: f.name });
      setMsg("");
    } catch (err) { setMsg(`Couldn't open ${f.name}: ${err instanceof Error ? err.message : "error"}.`); }
    setBusy("");
  };

  if (!open) return <button type="button" className={`fc-sent-open${light ? " is-light" : ""}`} data-hpd-smoke="fc-sent-open" onClick={() => void load()}>📄 See what you sent</button>;
  return (
    <div className={`fc-sent${light ? " is-light" : ""}`} data-hpd-smoke="fc-sent">
      <div className="fc-sent-head"><b>📄 What you sent for {omo}</b><button type="button" onClick={() => { setOpen(false); setShown(null); }}>Hide</button></div>
      {msg ? <p className="fc-sent-msg" data-hpd-smoke="fc-sent-msg">{msg}</p> : null}
      {emails?.length ? (
        <ul>
          {emails.map((e) => (
            <li key={e.id} data-hpd-smoke="fc-sent-email">
              <p><b>{when(e.at)}</b> · to {toWho(e.to)}</p>
              <small>{e.subject}</small>
              <div className="fc-sent-files">
                {e.files.map((f) => {
                  const key = `${e.id}|${f.i}`;
                  return <button key={key} type="button" className={shown?.key === key ? "is-on" : ""} data-hpd-smoke="fc-sent-file" disabled={busy === key} onClick={() => void openPdf(e, f)}>{busy === key ? "⏳" : shown?.key === key ? "▾" : "📄"} {f.name}</button>;
                })}
                {e.threadId ? <a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(e.threadId)}`} target="_blank" rel="noreferrer" data-hpd-smoke="fc-sent-gmail">Open in Gmail ↗</a> : null}
              </div>
              {shown && shown.key.startsWith(`${e.id}|`) ? (
                <div className="fc-sent-pdf" data-hpd-smoke="fc-sent-pdf">
                  <ItbPages pdfUrl={shown.url} pageCount={12} everyPage title={shown.name} />
                  <a href={shown.url} target="_blank" rel="noreferrer">Open the PDF ↗</a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
