"use client";

import { useEffect, useState } from "react";
import "../ios-app.css";
import { readWorkerHash, workerHashCut, type WorkerJob } from "../../lib/worker-link";
import { workFull, workWhere } from "../../lib/crew-share";
import { jobSummary, lineText } from "../../lib/job-summary";
import { judgePhoto } from "../../lib/worker-photo-quality";
import { finishByText, nyDay } from "../../lib/award-countdown";
import { labelWorkerPhoto } from "../../lib/field-photo-store";

const tel = (p: string) => `tel:${String(p).replace(/[^\d+]/g, "")}`;
const key = (id: string) => `hpd-worker-${id}`;
type Item = { key: string; side: "before" | "after"; file: File; url: string; video: boolean; state: "local" | "sending" | "sent" | "failed"; pct: number; n: number };

export default function WorkerPage() {
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [msg, setMsg] = useState("");
  const [cut, setCut] = useState(false);
  const [lookup, setLookup] = useState<"" | "ok" | "missing">("");
  const [items, setItems] = useState<Item[]>([]);
  const [sentCount, setSentCount] = useState<{ before: number; after: number }>({ before: 0, after: 0 });

  useEffect(() => {
    const j = readWorkerHash(window.location.hash);
    setJob(j);
    setCut(workerHashCut(window.location.hash));
    setReady(true);
    if (j) { try { const s = JSON.parse(localStorage.getItem(key(j.id)) || "{}"); setDone(s.done || {}); setFinished(!!s.finished); if (s.sent) setSentCount({ before: Number(s.sent.before) || 0, after: Number(s.sent.after) || 0 }); } catch { /* private mode */ } }
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
  // 📤 Each photo / video goes to the job card as soon as it's taken (with the link's pass), in 4 MB pieces, so a video
  // doesn't need a strong signal all at once. Without a pass (an older link) they wait for the WhatsApp button.
  async function send(x: Item) {
    if (!job?.pass) return;
    const set = (patch: Partial<Item>) => setItems((all) => all.map((y) => (y.key === x.key ? { ...y, ...patch } : y)));
    set({ state: "sending", pct: 0 });
    const head = { "X-HPD-Job": job.id, "X-HPD-Pass": job.pass };
    const type = x.file.type || (x.video ? "video/mp4" : "image/jpeg");
    try {
      const r = await fetch("/api/drive/worker-start", { method: "POST", headers: { ...head, "Content-Type": "application/json" }, body: JSON.stringify({ mediaId: x.key, size: x.file.size, mimeType: type, side: x.side, n: x.n, takenAt: new Date(x.file.lastModified || Date.now()).toISOString(), labeled: !x.video && /\blabeled\b/i.test(x.file.name) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { set({ state: "failed" }); setMsg(d.error || "Not sent. Tap ↻ Send again."); return; }
      if (!d.done) {
        const PIECE = 4 * 1024 * 1024;
        let at = 0;
        for (let tries = 0; at < x.file.size && tries < 400; tries++) {
          const piece = x.file.slice(at, Math.min(at + PIECE, x.file.size));
          const p = await fetch("/api/drive/worker-piece", { method: "POST", headers: { ...head, "Content-Type": "application/octet-stream", "X-HPD-Session": encodeURIComponent(d.session), "X-HPD-Start": String(at), "X-HPD-Total": String(x.file.size) }, body: piece });
          const q = await p.json().catch(() => ({}));
          if (q.done) { at = x.file.size; break; }
          if (!p.ok || typeof q.saved !== "number") { set({ state: "failed" }); setMsg(q.error || "Not sent. Tap ↻ Send again."); return; }
          at = q.saved;
          set({ pct: Math.round((at / x.file.size) * 100) });
        }
      }
      set({ state: "sent", pct: 100 });
      setSentCount((c) => { const next = { ...c, [x.side]: c[x.side] + 1 }; try { const k = key(job.id); const o = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...o, sent: next })); } catch { /* private mode */ } return next; });
    } catch { set({ state: "failed" }); setMsg("No signal? Tap ↻ Send again."); }
  }
  // 🏷 The label printed on each photo (owner, 25 Nov): OMO, where in the building (from HPD's description: apartment /
  // bathroom / public hallway...), the address and the day it was taken.
  const spot = (j: WorkerJob) => j.where || (j.apt ? `Apt ${j.apt.replace(/^apt\.?\s*/i, "")}` : "");
  const place = (j: WorkerJob) => `${j.address.replace(/,\s*\d{5}$/, "")}${j.apt ? `, apt ${j.apt.replace(/^apt\.?\s*/i, "")}` : ""}`;
  function addFiles(side: "before" | "after", e: React.ChangeEvent<HTMLInputElement>) {
    const fl = Array.from(e.target.files || []);
    e.target.value = "";
    void (async () => {
      const good: Item[] = [];
      const bad: string[] = [];
      for (const f0 of fl) {
        let f = f0;
        const video = f.type.startsWith("video/") || /\.(mov|mp4|m4v|3gp|webm)$/i.test(f.name);
        if (!video) { const v = await judgePhoto(f); if (!v.ok) { bad.push(v.reason || "Not clear."); continue; } }
        if (!video && job) { try { f = await labelWorkerPhoto(f, { jobId: job.id, side, address: place(job), location: spot(job) }); } catch { /* kept as taken: the job card labels it */ } }
        const n = items.filter((y) => y.side === side && y.video === video).length + good.filter((y) => y.video === video).length + 1;
        good.push({ key: `${job?.id}-${side}-${f.size}-${f.lastModified}-${n}`.replace(/[^\w:.+-]/g, "").slice(0, 100), side, file: f, url: URL.createObjectURL(f), video, state: "local", pct: 0, n });
      }
      if (good.length) { setItems((o) => [...o, ...good]); save({ ...done, [side === "before" ? "Before photos" : "After photos"]: true }, finished); }
      setMsg(bad.length ? `📷 ${bad[0]}${bad.length > 1 ? ` (${bad.length} photos need a retake)` : ""}` : good.length ? `✓ ${good.length} ${side.toUpperCase()} added.` : "");
      if (job?.pass) for (const x of good) await send(x);
    })();
  }
  function save(d: Record<string, boolean>, f: boolean) { setDone(d); setFinished(f); if (job) { try { localStorage.setItem(key(job.id), JSON.stringify({ done: d, finished: f, sent: sentCount })); } catch { /* private mode */ } } }

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
  const extra = job.photos.filter((p) => !/before|after/i.test(p));
  const big: React.CSSProperties = { display: "block", padding: "16px", borderRadius: 14, fontSize: 20, fontWeight: 700, textAlign: "center", textDecoration: "none", background: "#0a84ff", color: "#fff", border: 0, width: "100%", marginTop: 10 };
  return (
    <main className="ios-app" data-hpd-smoke="worker-job">
      <div className="ios-statusbar-spacer" />
      <header className="ios-navbar"><span className="ios-navbar-eyebrow">Your job</span><h1 className="ios-large-title" data-hpd-smoke="worker-id">{job.id}</h1></header>
      <div className="ios-content" style={{ fontSize: 20, lineHeight: 1.45 }}>
        <p data-hpd-smoke="worker-address"><strong>📍 {job.address ? addr : lookup === "missing" ? "Address not found: call your boss" : "Loading the job…"}</strong>{job.by ? <><br /><span data-hpd-smoke="worker-finish-by">⏰ HPD expects it done by {/\(\d+ days? (left|late)\)|due today/.test(job.by) ? job.by : finishByText(job.by, nyDay())}</span></> : null}</p>
        {job.where ? <p data-hpd-smoke="worker-where" style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(10,132,255,.12)", fontWeight: 700 }}>🚪 Where: {job.where}</p> : null}
        <a style={big} href={maps} data-hpd-smoke="worker-nav">🧭 Navigate</a>
        {job.contact ? <a style={{ ...big, background: "#30a14e" }} href={tel(job.contact.phone)} data-hpd-smoke="worker-call-super">📞 Call {job.contact.name}{job.contact.note ? ` (${job.contact.note})` : ""}</a> : null}
        {job.tenant?.phone ? <a style={{ ...big, background: "#30a14e" }} href={tel(job.tenant.phone)} data-hpd-smoke="worker-call-tenant">📞 Call tenant{job.tenant.name ? ` ${job.tenant.name}` : ""}</a> : null}
        {job.work.length ? <><h2>The work</h2><ul data-hpd-smoke="worker-work">{job.work.map((w, i) => <li key={i}>{w}</li>)}</ul></> : null}
        {job.full ? <details open data-hpd-smoke="worker-full"><summary style={{ fontWeight: 700 }}>📄 HPD&apos;s full description</summary><p style={{ whiteSpace: "pre-wrap", fontSize: 17 }}>{job.full}</p></details> : null}
        {/* 📸 Before / After (owner, 25 Nov): a Before and an After part, each with Photo, Video and From phone, as many as
            needed; each one is labeled BEFORE or AFTER and, with the link's pass, goes straight to the boss's job card. */}
        <h2 style={{ marginBottom: 4 }}>📸 Before and after</h2>
        <p style={{ opacity: 0.75, marginTop: 0, fontSize: 17 }}>Same spot before and after, lights on. Take as many photos and videos as you need.{extra.length ? ` Also: ${extra.join(", ")}.` : ""}</p>
        {(["before", "after"] as const).map((side) => {
          const mine = items.filter((x) => x.side === side);
          const color = side === "before" ? "#ff9f0a" : "#30a14e";
          return (
            <section key={side} data-hpd-smoke={`worker-side-${side}`} style={{ margin: "12px 0", padding: 12, borderRadius: 16, border: `3px solid ${color}` }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 22, color }}>{side === "before" ? "1️⃣ BEFORE the work" : "2️⃣ AFTER the work"}{mine.length || sentCount[side] ? <span style={{ fontSize: 16, marginLeft: 8, color: "inherit", opacity: 0.8 }} data-hpd-smoke={`worker-count-${side}`}>{Math.max(mine.length, sentCount[side])} taken</span> : null}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label style={{ ...big, marginTop: 0, padding: "14px 4px", fontSize: 18, background: color }} data-hpd-smoke={`worker-photo-${side}`}>📷 Photo
                  <input type="file" accept="image/*" capture="environment" multiple hidden data-hpd-smoke={`worker-photo-file-${side}`} onChange={(e) => addFiles(side, e)} />
                </label>
                <label style={{ ...big, marginTop: 0, padding: "14px 4px", fontSize: 18, background: color }} data-hpd-smoke={`worker-video-${side}`}>🎥 Video
                  <input type="file" accept="video/*" capture="environment" hidden data-hpd-smoke={`worker-video-file-${side}`} onChange={(e) => addFiles(side, e)} />
                </label>
                <label style={{ ...big, marginTop: 0, padding: "14px 4px", fontSize: 16, background: "#3a3a3c" }}>🖼 From phone
                  <input type="file" accept="image/*,video/*" multiple hidden data-hpd-smoke={`worker-lib-${side}`} onChange={(e) => addFiles(side, e)} />
                </label>
              </div>
              <small data-hpd-smoke={`worker-label-${side}`} style={{ display: "block", marginTop: 8, fontSize: 15, fontWeight: 700, opacity: 0.85 }}>🏷 Printed on each photo: {side.toUpperCase()} · OMO {job.id}{spot(job) ? ` · ${spot(job)}` : ""}{job.address ? ` · ${place(job)}` : ""} · date taken</small>
              {mine.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                {mine.map((x) => (
                  <figure key={x.key} data-hpd-smoke="worker-item" data-side={side} data-state={x.state} style={{ margin: 0, position: "relative", borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "1" }}>
                    {x.video ? <video src={x.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={x.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    <b style={{ position: "absolute", left: 4, top: 4, padding: "2px 6px", borderRadius: 6, background: color, color: "#fff", fontSize: 12 }}>{side.toUpperCase()}{x.video ? " 🎥" : ""}</b>
                    <figcaption style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 4px", background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                      {x.state === "sent" ? "✓ Sent" : x.state === "sending" ? `Sending ${x.pct}%` : x.state === "failed" ? <button type="button" onClick={() => void send(x)} style={{ border: 0, background: "#dc2626", color: "#fff", borderRadius: 6, fontWeight: 800 }}>↻ Send again</button> : "On this phone"}
                    </figcaption>
                  </figure>
                ))}
              </div> : null}
            </section>
          );
        })}
        {job.pass && items.length ? <p data-hpd-smoke="worker-sent-line" style={{ fontSize: 17, fontWeight: 700 }}>{items.every((x) => x.state === "sent") ? `✓ All ${items.length} are on job ${job.id}'s card for your boss.` : `Sending to job ${job.id}'s card… keep this page open.`}</p> : null}
        {/* No WhatsApp step (owner, 25 Nov: "I don't need them to send me back on WhatsApp ... they're not labeled"): the
            photos only go to the job card; an old link without the upload pass says so. */}
        {!job.pass ? <p data-hpd-smoke="worker-old-link" style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,69,58,.15)", fontWeight: 700, fontSize: 18 }}>⚠️ This is an old link: your photos can&apos;t reach the job card from it. Ask your boss to send you the job again, then take the photos from the new link.</p> : null}
        <button type="button" style={{ ...big, background: finished ? "#6e6e73" : "#ff9f0a" }} data-hpd-smoke="worker-done" onClick={async () => {
          const f = !finished; save(done, f);
          if (!f) return;
          const b = Math.max(items.filter((x) => x.side === "before").length, sentCount.before), a = Math.max(items.filter((x) => x.side === "after").length, sentCount.after);
          const text = `HPD job ${job.id} is done. Before: ${b}, after: ${a}${job.pass ? " (on the job card)" : ""}.`;
          const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
          try { if (nav.share) { await nav.share({ text }); setMsg("Sent."); } else { await navigator.clipboard.writeText(text); setMsg("Copied: paste it in a text to your boss."); } } catch { setMsg("Marked done on this phone."); }
        }}>{finished ? "✓ Done (tap to undo)" : "✅ Job done"}</button>
        {msg ? <p role="status" data-hpd-smoke="worker-msg">{msg}</p> : null}
        <p style={{ opacity: 0.6, fontSize: 15, marginTop: 24 }}>Only your job is shown here.</p>
      </div>
    </main>
  );
}
