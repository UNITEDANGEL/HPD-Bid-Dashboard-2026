"use client";
// "See what you sent" (owner, 20 Oct: "once you find it was sent before, point me to the paperwork that was sent; I need
// a link to see and confirm, not just the dates"): the emails you sent naming this job with PDFs (from your Gmail,
// read-only), each PDF opened right here (pinch to zoom), plus a link to the email in Gmail.
import { useEffect, useState } from "react";
import ItbPages from "./ItbPages";
import "./sent-paperwork.css";

type SentEmail = { id: string; threadId: string; at: string; to: string; subject: string; files: { i: number; name: string; size: number; mime?: string }[] };
const isPdf = (f: { mime?: string; name: string }) => !f.mime || f.mime === "application/pdf" || /\.pdf$/i.test(f.name);
const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
const toWho = (to: string) => to.replace(/<[^>]*>/g, "").replace(/"/g, "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(", ") || to;

export default function SentPaperwork({ omo, light = false }: { omo: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<SentEmail[] | null>(null);
  const [msg, setMsg] = useState("");
  const [shown, setShown] = useState<{ key: string; url: string; name: string; mime: string } | null>(null);
  // 📤 Everything one email carried (owner, 4 Nov, ER07663: "I want to have a copy so I can send it... the before, after
  // and the affidavit, everything that was sent"): fetched from your Gmail and handed to the iPhone's share sheet
  // (Mail, Save to Files, AirDrop), so nothing gets lost in Downloads.
  const [copy, setCopy] = useState<{ id: string; text: string; links?: { name: string; url: string }[] } | null>(null);
  const fetchFile = async (e: SentEmail, f: SentEmail["files"][number]) => {
    const r = await fetch("/api/drive/hpd-sent-pdf", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, i: f.i }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(String(d.error || `HTTP ${r.status}`)); }
    return new File([await r.blob()], f.name, { type: f.mime || "application/pdf" });
  };
  const copyAll = async (e: SentEmail) => {
    setCopy({ id: e.id, text: `Getting ${e.files.length} file${e.files.length === 1 ? "" : "s"} from your email…` });
    try {
      const files: File[] = [];
      for (const f of e.files) { setCopy({ id: e.id, text: `Getting ${files.length + 1} of ${e.files.length}: ${f.name}…` }); files.push(await fetchFile(e, f)); }
      if (navigator.canShare?.({ files })) {
        try { await navigator.share({ files, title: e.subject }); setCopy({ id: e.id, text: `✓ ${files.length} file${files.length === 1 ? "" : "s"} ready: pick Mail to send them, or Save to Files to keep a copy.` }); }
        catch { setCopy({ id: e.id, text: "Closed without sending. Tap again any time.", links: files.map((x) => ({ name: x.name, url: URL.createObjectURL(x) })) }); }
        return;
      }
      setCopy({ id: e.id, text: "This browser can't share files: tap each one to save it.", links: files.map((x) => ({ name: x.name, url: URL.createObjectURL(x) })) });
    } catch (err) { setCopy({ id: e.id, text: `Couldn't get the files: ${err instanceof Error ? err.message : "error"}. Open the email in Gmail instead.` }); }
  };
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
      setMsg(d.emails.length ? "" : `No email with files naming ${omo} in your sent mail.`);
    } catch { setMsg("No connection to your email right now."); }
  };
  const openPdf = async (e: SentEmail, f: SentEmail["files"][number]) => {
    const key = `${e.id}|${f.i}`;
    if (shown?.key === key) { setShown(null); return; }
    setBusy(key);
    try {
      const file = await fetchFile(e, f);
      setShown({ key, url: URL.createObjectURL(file), name: f.name, mime: file.type });
      setMsg("");
    } catch (err) { setMsg(`Couldn't open ${f.name}: ${err instanceof Error ? err.message : "error"}.`); }
    setBusy("");
  };

  if (!open) return <button type="button" className={`fc-sent-open${light ? " is-light" : ""}`} data-hpd-smoke="fc-sent-open" onClick={() => void load()}>📄 See what you sent</button>;
  return (
    <div className={`fc-sent${light ? " is-light" : ""}`} data-hpd-smoke="fc-sent">
      <div className="fc-sent-head"><b>📄 What you sent for {omo}</b><button type="button" onClick={() => { setOpen(false); setShown(null); }}>Hide</button></div>
      {msg ? <p className="fc-sent-msg" data-hpd-smoke="fc-sent-msg">{/…$/.test(msg) ? <><span className="hpd-spin" aria-hidden="true" /> {msg.replace(/…$/, "")}<span className="hpd-dots" /></> : msg}</p> : null}
      {emails?.length ? (
        <ul>
          {emails.map((e) => (
            <li key={e.id} data-hpd-smoke="fc-sent-email">
              <p><b>{when(e.at)}</b> · to {toWho(e.to)}</p>
              <small>{e.subject}</small>
              <div className="fc-sent-files">
                {e.files.map((f) => {
                  const key = `${e.id}|${f.i}`;
                  return <button key={key} type="button" className={shown?.key === key ? "is-on" : ""} data-hpd-smoke="fc-sent-file" disabled={busy === key} onClick={() => void openPdf(e, f)}>{busy === key ? <span className="hpd-spin" aria-hidden="true" /> : shown?.key === key ? "▾" : isPdf(f) ? "📄" : /^video/.test(f.mime || "") ? "🎥" : "📷"} {f.name}{f.size ? <small> · {mb(f.size)}</small> : null}</button>;
                })}
                {e.files.length > 1 || !isPdf(e.files[0]) ? <button type="button" className="fc-sent-copy" data-hpd-smoke="fc-sent-copy" disabled={Boolean(copy && copy.id === e.id && /…$/.test(copy.text))} onClick={() => void copyAll(e)}>📤 Get a copy of everything ({e.files.length})</button> : null}
                {e.threadId ? <a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(e.threadId)}`} target="_blank" rel="noreferrer" data-hpd-smoke="fc-sent-gmail">Open in Gmail ↗</a> : null}
              </div>
              {copy && copy.id === e.id ? (
                <p className="fc-sent-msg" data-hpd-smoke="fc-sent-copy-msg">{/…$/.test(copy.text) ? <span className="hpd-spin" aria-hidden="true" /> : null} {copy.text}
                  {copy.links?.length ? <span className="fc-sent-links">{copy.links.map((l) => <a key={l.url} href={l.url} download={l.name}>⬇ {l.name}</a>)}</span> : null}</p>
              ) : null}
              {shown && shown.key.startsWith(`${e.id}|`) ? (
                <div className="fc-sent-pdf" data-hpd-smoke="fc-sent-pdf">
                  {shown.mime.startsWith("image/") ? <img src={shown.url} alt={shown.name} style={{ width: "100%", borderRadius: 10 }} />
                    : shown.mime.startsWith("video/") ? <video src={shown.url} controls playsInline style={{ width: "100%", borderRadius: 10 }} />
                    : <ItbPages pdfUrl={shown.url} pageCount={12} everyPage title={shown.name} />}
                  <a href={shown.url} target="_blank" rel="noreferrer">Open it ↗</a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
