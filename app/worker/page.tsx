"use client";

import { useEffect, useState } from "react";
import "../ios-app.css";
import { readWorkerHash, workerHashCut, type WorkerJob } from "../../lib/worker-link";
import { workFull, workWhere } from "../../lib/crew-share";
import { jobSummary, lineText } from "../../lib/job-summary";
import { judgePhoto } from "../../lib/worker-photo-quality";

const tel = (p: string) => `tel:${String(p).replace(/[^\d+]/g, "")}`;
const key = (id: string) => `hpd-worker-${id}`;

export default function WorkerPage() {
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [cut, setCut] = useState(false);
  const [lookup, setLookup] = useState<"" | "ok" | "missing">("");

  useEffect(() => {
    const j = readWorkerHash(window.location.hash);
    setJob(j);
    setCut(workerHashCut(window.location.hash));
    setReady(true);
    if (j) { try { const s = JSON.parse(localStorage.getItem(key(j.id)) || "{}"); setDone(s.done || {}); setFinished(!!s.finished); } catch { /* private mode */ } }
    // The short link has only the job number (+ apartment / tenant / super): the address, the work, where it is and HPD's
    // full description come from the site's public job list (no tenant data there).
    if (j && (!j.full || !j.address)) {
      void fetch("/data/COA_Fetcher_2026.json").then((r) => r.json()).then((d) => {
        const rows: Record<string, unknown>[] = Array.isArray(d) ? d : d?.jobs || [];
        const row = rows.find((x) => String(x.OMO || "") === j.id);
        if (!row) { if (!j.address) setLookup("missing"); return; }
        const s = (k: string) => String(row[k] || "").trim();
        const text = ["ItbPage3Description", "JobDescription", "Job_Description"].map(s).sort((a, b) => b.length - a.length)[0];
        const full = workFull(text);
        const apt = j.apt || s("ApartmentUnit") || s("ItbTenantApartment") || undefined;
        const sum = jobSummary(text);
        setJob((cur) => (cur && cur.id === j.id ? { ...cur, full: cur.full || full || undefined, address: cur.address || s("BuildingAddress") || s("Location"), apt: cur.apt || apt,
          by: cur.by || s("WorkCompletionDate") || undefined, work: cur.work.length ? cur.work : sum.lines.map(lineText).slice(0, 8),
          where: cur.where || workWhere(text, apt) || undefined } : cur));
        setLookup("ok");
      }).catch(() => { if (!j.address) setLookup("missing"); });
    }
  }, []);
  function save(d: Record<string, boolean>, f: boolean) { setDone(d); setFinished(f); if (job) { try { localStorage.setItem(key(job.id), JSON.stringify({ done: d, finished: f })); } catch { /* private mode */ } } }

  if (!ready) return <main className="ios-app" />;
  if (!job) return (
    <main className="ios-app" data-hpd-smoke="worker-empty">
      <div className="ios-statusbar-spacer" />
      <header className="ios-navbar"><h1 className="ios-large-title">Worker</h1></header>
      <div className="ios-content">{cut
        ? <p style={{ fontSize: 20, lineHeight: 1.4 }} data-hpd-smoke="worker-cut">⚠️ This link got cut off on the way, so the job can&apos;t show. Ask your boss to send it again.</p>
        : <p style={{ fontSize: 20, lineHeight: 1.4 }}>Open the link your boss sent you. It shows the job: the address, the work and the photos to take.</p>}</div>
    </main>
  );
  const addr = `${job.address.replace(/,\s*\d{5}$/, "")}${job.apt ? `, apt ${job.apt.replace(/^apt\.?\s*/i, "")}` : ""}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${job.address}, NY`)}`;
  const left = job.photos.filter((p) => !done[p]).length;
  const big: React.CSSProperties = { display: "block", padding: "16px", borderRadius: 14, fontSize: 20, fontWeight: 700, textAlign: "center", textDecoration: "none", background: "#0a84ff", color: "#fff", border: 0, width: "100%", marginTop: 10 };
  return (
    <main className="ios-app" data-hpd-smoke="worker-job">
      <div className="ios-statusbar-spacer" />
      <header className="ios-navbar"><span className="ios-navbar-eyebrow">Your job</span><h1 className="ios-large-title" data-hpd-smoke="worker-id">{job.id}</h1></header>
      <div className="ios-content" style={{ fontSize: 20, lineHeight: 1.45 }}>
        <p data-hpd-smoke="worker-address"><strong>📍 {job.address ? addr : lookup === "missing" ? "Address not found: call your boss" : "Loading the job…"}</strong>{job.by ? <><br />Finish by {job.by}</> : null}</p>
        {job.where ? <p data-hpd-smoke="worker-where" style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(10,132,255,.12)", fontWeight: 700 }}>🚪 Where: {job.where}</p> : null}
        <a style={big} href={maps} data-hpd-smoke="worker-nav">🧭 Navigate</a>
        {job.contact ? <a style={{ ...big, background: "#30a14e" }} href={tel(job.contact.phone)} data-hpd-smoke="worker-call-super">📞 Call {job.contact.name}{job.contact.note ? ` (${job.contact.note})` : ""}</a> : null}
        {job.tenant?.phone ? <a style={{ ...big, background: "#30a14e" }} href={tel(job.tenant.phone)} data-hpd-smoke="worker-call-tenant">📞 Call tenant{job.tenant.name ? ` ${job.tenant.name}` : ""}</a> : null}
        {job.work.length ? <><h2>The work</h2><ul data-hpd-smoke="worker-work">{job.work.map((w, i) => <li key={i}>{w}</li>)}</ul></> : null}
        {job.full ? <details open data-hpd-smoke="worker-full"><summary style={{ fontWeight: 700 }}>📄 HPD&apos;s full description</summary><p style={{ whiteSpace: "pre-wrap", fontSize: 17 }}>{job.full}</p></details> : null}
        {job.photos.length ? <>
          <h2>📸 Photos to take ({left} left)</h2>
          <p style={{ opacity: 0.7, marginTop: 0 }}>Same spot before and after, lights on.</p>
          {job.photos.map((p) => (
            <label key={p} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
              <input type="checkbox" style={{ width: 28, height: 28 }} checked={!!done[p]} onChange={(e) => save({ ...done, [p]: e.target.checked }, finished)} data-hpd-smoke="worker-photo" /> {p}
              <span style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 10, background: "#0a84ff", color: "#fff", fontWeight: 700 }}>📷 {files[p]?.length ? `${files[p].length} added` : "Add"}
                <input type="file" accept="image/*" multiple hidden data-hpd-smoke="worker-photo-file" onChange={(e) => { const fl = Array.from(e.target.files || []); e.target.value = ""; void (async () => { const good: File[] = []; const bad: string[] = []; for (const f of fl) { const v = await judgePhoto(f); if (v.ok) good.push(f); else bad.push(v.reason || "Not clear."); } if (good.length) { setFiles((o) => ({ ...o, [p]: [...(o[p] || []), ...good] })); save({ ...done, [p]: true }, finished); } setMsg(bad.length ? `📷 ${p}: ${bad[0]}${bad.length > 1 ? ` (${bad.length} photos need a retake)` : ""}` : good.length ? `✓ ${p}: ${good.length} photo(s) look good.` : ""); })(); }} />
              </span>
            </label>
          ))}</> : null}
        {Object.values(files).some((a) => a.length) ? <button type="button" style={{ ...big, background: "#25d366" }} data-hpd-smoke="worker-send-photos" onClick={async () => {
          const all = Object.entries(files).flatMap(([label, a]) => a.map((f, i) => new File([f], `${job.id}-${label.replace(/[^A-Za-z0-9]+/g, "-")}-${i + 1}.jpg`, { type: f.type || "image/jpeg" })));
          const nav = navigator as Navigator & { share?: (d: { files?: File[]; text?: string }) => Promise<void>; canShare?: (d: { files: File[] }) => boolean };
          try { if (nav.share && (!nav.canShare || nav.canShare({ files: all }))) { await nav.share({ files: all, text: `HPD job ${job.id}: ${all.length} photo(s)` }); setMsg("Photos sent."); } else setMsg("This phone can't send photos from here: open the link in Safari or Chrome."); } catch { setMsg("Not sent."); }
        }}>📤 Send {Object.values(files).reduce((n, a) => n + a.length, 0)} photo(s) to your boss (WhatsApp)</button> : null}
        <button type="button" style={{ ...big, background: finished ? "#6e6e73" : "#ff9f0a" }} data-hpd-smoke="worker-done" onClick={async () => {
          const f = !finished; save(done, f);
          if (!f) return;
          const text = `HPD job ${job.id} is done. Photos taken: ${job.photos.length - left} of ${job.photos.length}.`;
          const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
          try { if (nav.share) { await nav.share({ text }); setMsg("Sent."); } else { await navigator.clipboard.writeText(text); setMsg("Copied: paste it in a text to your boss."); } } catch { setMsg("Marked done on this phone."); }
        }}>{finished ? "✓ Done (tap to undo)" : "✅ Job done"}</button>
        {msg ? <p role="status" data-hpd-smoke="worker-msg">{msg}</p> : null}
        <p style={{ opacity: 0.6, fontSize: 15, marginTop: 24 }}>Only your job is shown here.</p>
      </div>
    </main>
  );
}
