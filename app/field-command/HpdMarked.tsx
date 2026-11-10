"use client";
// 🔎 What HPD marked (owner, 9 Nov: "I should be able to see the thing I need to fix, especially if a PDF is attached and
// marked"): HPD's own marked-up copy (the highlights and circles), opened right here from your Gmail (read only), every
// page, pinch to zoom. On the notice card and on the fix page, next to the fix steps.
import { useEffect, useState } from "react";
import ItbPages from "./ItbPages";
import { loadMarked, markedFor, markedLines } from "../../lib/hpd-marks";

export default function HpdMarked({ threadId, name = "", light = false, omo = "" }: { threadId: string; name?: string; light?: boolean; omo?: string }) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  // The boxes HPD marked, read from their scan ahead of time (scripts/fetch_hpd_marks.py): shown without opening it.
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    let live = true;
    void loadMarked().then((all) => { if (live) setLines(markedLines(markedFor(all, threadId, omo))); });
    return () => { live = false; };
  }, [threadId, omo]);
  if (!threadId && !lines.length) return null;
  const load = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (url) return;
    setMsg("Opening HPD's marked copy…");
    try {
      const r = await fetch("/api/drive/hpd-thread-pdf", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId }) });
      if (r.status === 401) { setMsg("Sign in with Google on this phone (Storage page) to see HPD's PDF."); return; }
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(String(d.error || `Couldn't open it (HTTP ${r.status}).`)); return; }
      setUrl(URL.createObjectURL(await r.blob()));
      setMsg("");
    } catch { setMsg("No connection to your email right now."); }
  };
  return (
    <div className={`fc-hpd-marked${light ? " is-light" : ""}`} data-hpd-smoke="fc-hpd-marked">
      {lines.length ? (
        <div className="fc-hpd-marked-boxes" data-hpd-smoke="fc-hpd-marked-boxes">
          <strong>🖍 HPD marked:</strong>
          <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ) : null}
      {threadId ? <button type="button" className="fc-hpd-marked-open" data-hpd-smoke="fc-hpd-marked-open" onClick={() => void load()}>{open ? "▾ Hide HPD's marked copy" : `🔎 See what HPD marked${name ? ` (${name.replace(/\.pdf$/i, "")})` : ""}`}</button> : null}
      {open && msg ? <p className="fc-hpd-marked-msg" data-hpd-smoke="fc-hpd-marked-msg">{msg}</p> : null}
      {open && url ? (
        <div className="fc-hpd-marked-pages" data-hpd-smoke="fc-hpd-marked-pages">
          <small>Fix every highlighted or circled spot, then make the new copy.</small>
          <ItbPages pdfUrl={url} pageCount={12} everyPage title={name || "HPD's marked copy"} />
          <a href={url} target="_blank" rel="noreferrer">Open it ↗</a>
        </div>
      ) : null}
    </div>
  );
}
