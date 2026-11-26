"use client";

import { useEffect, useRef, useState } from "react";
import "../ios-app.css";
import { readWorkerHash, workerHashCut, type WorkerJob } from "../../lib/worker-link";
import { workFull, workRooms, workWhere } from "../../lib/crew-share";
import { jobSummary, lineText } from "../../lib/job-summary";
import { judgePhoto } from "../../lib/worker-photo-quality";
import { finishByText, nyDay } from "../../lib/award-countdown";
import { labelWorkerPhoto } from "../../lib/field-photo-store";

const tel = (p: string) => `tel:${String(p).replace(/[^\d+]/g, "")}`;
const key = (id: string) => `hpd-worker-${id}`;
type Item = { key: string; side: "before" | "after"; file: File; url: string; video: boolean; state: "local" | "sending" | "sent" | "failed"; pct: number; n: number; spot: string };
// 📍 Where in the apartment / building the photo is taken (owner, 25 Nov: "are we able to label the location where the picture
// is taken? Then you can do the numbering"): the worker taps one before taking photos; it is on the photo and in its name.
const SPOTS = ["Kitchen", "Bathroom", "Bedroom", "Living room", "Hallway", "Ceiling", "Window", "Door", "Stairs", "Basement", "Boiler room", "Roof", "Outside"];
const cleanSpot = (v: string) => { const t = String(v || "").replace(/[^\p{L}\p{N} #'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30); return t ? t[0].toUpperCase() + t.slice(1) : ""; };

export default function WorkerPage() {
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [msg, setMsg] = useState("");
  const [cut, setCut] = useState(false);
  const [lookup, setLookup] = useState<"" | "ok" | "missing">("");
  const [items, setItems] = useState<Item[]>([]);
  const announced = useRef(false); // 📸 the first photo of this visit tells the boss's map "new from worker" (plan item 43)
  const [spot, setSpot] = useState("");
  const [typing, setTyping] = useState(false);
  const [chat, setChat] = useState<{ at: string; from: "boss" | "worker"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState("");
  const [sentCount, setSentCount] = useState<{ before: number; after: number }>({ before: 0, after: 0 });

  useEffect(() => {
    const j = readWorkerHash(window.location.hash);
    setJob(j);
    setCut(workerHashCut(window.location.hash));
    setReady(true);
    if (j) { try { const s = JSON.parse(localStorage.getItem(key(j.id)) || "{}"); setDone(s.done || {}); setFinished(!!s.finished); if (s.spot) setSpot(cleanSpot(s.spot)); if (s.sent) setSentCount({ before: Number(s.sent.before) || 0, after: Number(s.sent.after) || 0 }); } catch { /* private mode */ } }
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
      const r = await fetch("/api/drive/worker-start", { method: "POST", headers: { ...head, "Content-Type": "application/json" }, body: JSON.stringify({ mediaId: x.key, size: x.file.size, mimeType: type, side: x.side, where: x.spot, n: x.n, takenAt: new Date(x.file.lastModified || Date.now()).toISOString(), labeled: !x.video && /\blabeled\b/i.test(x.file.name), ...(announced.current ? {} : { announce: true }) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { set({ state: "failed" }); setMsg(d.error || "Not sent. Tap ↻ Send again."); return; }
      announced.current = true;
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
  // 💬 Chat with the boss (owner, 26 Nov: "instead of WhatsApp can we communicate ... a chat or an app"): on this page, with
  // the link's pass; the boss answers from the job card. Looks for new messages every 15 seconds while the page is open.
  async function talk(text = "") {
    if (!job?.pass) return false;
    try {
      const r = await fetch("/api/drive/worker-chat", { method: "POST", headers: { "X-HPD-Job": job.id, "X-HPD-Pass": job.pass, "Content-Type": "application/json" }, body: JSON.stringify(text ? { text } : {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChatErr(d.error || "No signal? Try again."); return false; }
      setChat(Array.isArray(d.messages) ? d.messages : []);
      setChatErr("");
      return true;
    } catch { setChatErr("No signal? Try again."); return false; }
  }
  useEffect(() => {
    if (!job?.pass) return;
    void talk();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void talk(); }, 15000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.pass]);
  // 🏷 The label printed on each photo (owner, 25 Nov): OMO, where in the building (from HPD's description: apartment /
  // bathroom / public hallway...), the address and the day it was taken.
  const buildingSpot = (j: WorkerJob) => j.where || (j.apt ? `Apt ${j.apt.replace(/^apt\.?\s*/i, "")}` : "");
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
        if (!video && job) { try { f = await labelWorkerPhoto(f, { jobId: job.id, side, address: place(job), location: spot ? `${spot.toUpperCase()} · ${buildingSpot(job)}`.replace(/ · $/, "") : buildingSpot(job) }); } catch { /* kept as taken: the job card labels it */ } }
        const n = items.filter((y) => y.side === side && y.video === video && y.spot === spot).length + good.filter((y) => y.video === video).length + 1;
        good.push({ key: `${job?.id}-${side}-${spot}-${f.size}-${f.lastModified}-${n}`.replace(/[^\w:.+-]/g, "").slice(0, 100), side, file: f, url: URL.createObjectURL(f), video, state: "local", pct: 0, n, spot });
      }
      if (good.length) { setItems((o) => [...o, ...good]); save({ ...done, [side === "before" ? "Before photos" : "After photos"]: true }, finished); }
      setMsg(bad.length ? `📷 ${bad[0]}${bad.length > 1 ? ` (${bad.length} photos need a retake)` : ""}` : good.length ? `✓ ${good.length} ${side.toUpperCase()}${spot ? ` (${spot})` : ""} added.` : "");
      if (job?.pass) for (const x of good) await send(x);
    })();
  }
  function save(d: Record<string, boolean>, f: boolean) { setDone(d); setFinished(f); if (job) { try { localStorage.setItem(key(job.id), JSON.stringify({ done: d, finished: f, sent: sentCount, spot })); } catch { /* private mode */ } } }

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
  const hpdRooms = workRooms(job.full || job.work.join("\n"));
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
        <div data-hpd-smoke="worker-spots" style={{ padding: 12, borderRadius: 16, background: "rgba(10,132,255,.10)", border: spot ? "2px solid transparent" : "2px dashed #0a84ff" }}>
          <p style={{ margin: "0 0 8px", fontWeight: 800 }} data-hpd-smoke="worker-spot-now">📍 {spot ? <>Taking photos in: <span style={{ color: "#0a84ff" }}>{spot}</span></> : "First tap where you are (📄 = from HPD's description):"}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* HPD's description names the spots first (owner, 26 Nov: "the description tells you where you are ... the kitchen window"). */}
            {[...hpdRooms, ...SPOTS].filter((v, i, a) => v && a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i).map((v) => (
              <button key={v} type="button" data-hpd-smoke="worker-spot" data-spot={v} aria-pressed={spot === v} data-from-hpd={hpdRooms.includes(v) ? "1" : undefined} onClick={() => { setSpot(v); setTyping(false); setMsg(""); try { const k = key(job.id); const o = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...o, spot: v })); } catch { /* private mode */ } }}
                style={{ padding: "10px 12px", borderRadius: 999, border: 0, fontSize: 17, fontWeight: 700, background: spot === v ? "#0a84ff" : "rgba(120,120,128,.2)", color: spot === v ? "#fff" : "inherit" }}>{hpdRooms.includes(v) ? `📄 ${v}` : v}</button>
            ))}
            <button type="button" data-hpd-smoke="worker-spot-other" onClick={() => setTyping(true)} style={{ padding: "10px 12px", borderRadius: 999, border: 0, fontSize: 17, fontWeight: 700, background: spot && !SPOTS.includes(spot) ? "#0a84ff" : "rgba(120,120,128,.2)", color: spot && !SPOTS.includes(spot) ? "#fff" : "inherit" }}>✏️ Other</button>
          </div>
          {typing ? <input autoFocus data-hpd-smoke="worker-spot-type" placeholder="e.g. Back bedroom closet" maxLength={30} style={{ marginTop: 8, width: "100%", fontSize: 18, padding: 10, borderRadius: 10, border: "1px solid #8e8e93" }}
            onBlur={(e) => { const v = cleanSpot(e.target.value); if (v) { setSpot(v); try { const k = key(job.id); const o = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...o, spot: v })); } catch { /* private mode */ } } setTyping(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : null}
          <p style={{ margin: "8px 0 0", fontSize: 15, opacity: 0.75 }}>Moving to another room? Tap it first. Use the same spot for its before and after.</p>
        </div>
        {(["before", "after"] as const).map((side) => {
          const mine = items.filter((x) => x.side === side);
          const color = side === "before" ? "#ff9f0a" : "#30a14e";
          return (
            <section key={side} data-hpd-smoke={`worker-side-${side}`} style={{ margin: "12px 0", padding: 12, borderRadius: 16, border: `3px solid ${color}` }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 22, color }}>{side === "before" ? "1️⃣ BEFORE the work" : "2️⃣ AFTER the work"}{mine.length || sentCount[side] ? <span style={{ fontSize: 16, marginLeft: 8, color: "inherit", opacity: 0.8 }} data-hpd-smoke={`worker-count-${side}`}>{Math.max(mine.length, sentCount[side])} taken</span> : null}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label style={{ ...big, marginTop: 0, padding: "14px 4px", fontSize: 18, background: color }} data-hpd-smoke={`worker-photo-${side}`} onClick={(e) => { if (!spot) { e.preventDefault(); setMsg("📍 First tap where you are (Kitchen, Bathroom…), then take the photo."); document.querySelector("[data-hpd-smoke=worker-spots]")?.scrollIntoView({ block: "center", behavior: "smooth" }); } }}>📷 Photo
                  <input type="file" accept="image/*" capture="environment" multiple hidden data-hpd-smoke={`worker-photo-file-${side}`} onChange={(e) => addFiles(side, e)} />
                </label>
                <label style={{ ...big, marginTop: 0, padding: "14px 4px", fontSize: 18, background: color }} data-hpd-smoke={`worker-video-${side}`} onClick={(e) => { if (!spot) { e.preventDefault(); setMsg("📍 First tap where you are (Kitchen, Bathroom…), then take the photo."); document.querySelector("[data-hpd-smoke=worker-spots]")?.scrollIntoView({ block: "center", behavior: "smooth" }); } }}>🎥 Video
                  <input type="file" accept="video/*" capture="environment" hidden data-hpd-smoke={`worker-video-file-${side}`} onChange={(e) => addFiles(side, e)} />
                </label>
                <label style={{ ...big, marginTop: 0, padding: "14px 4px", fontSize: 16, background: "#3a3a3c" }} onClick={(e) => { if (!spot) { e.preventDefault(); setMsg("📍 First tap where you are (Kitchen, Bathroom…), then take the photo."); document.querySelector("[data-hpd-smoke=worker-spots]")?.scrollIntoView({ block: "center", behavior: "smooth" }); } }}>🖼 From phone
                  <input type="file" accept="image/*,video/*" multiple hidden data-hpd-smoke={`worker-lib-${side}`} onChange={(e) => addFiles(side, e)} />
                </label>
              </div>
              <small data-hpd-smoke={`worker-label-${side}`} style={{ display: "block", marginTop: 8, fontSize: 15, fontWeight: 700, opacity: 0.85 }}>🏷 Printed on each photo: {side.toUpperCase()} · OMO {job.id}{spot || buildingSpot(job) ? ` · ${[spot.toUpperCase(), buildingSpot(job)].filter(Boolean).join(" · ")}` : ""}{job.address ? ` · ${place(job)}` : ""} · date taken</small>
              {mine.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                {mine.map((x) => (
                  <figure key={x.key} data-hpd-smoke="worker-item" data-side={side} data-state={x.state} style={{ margin: 0, position: "relative", borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "1" }}>
                    {x.video ? <video src={x.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={x.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    <b style={{ position: "absolute", left: 4, bottom: 26, maxWidth: "calc(100% - 8px)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "1px 5px", borderRadius: 6, background: color, color: "#fff", fontSize: 11 }}>{side.toUpperCase()}{x.video ? " 🎥" : ""}{x.spot ? ` · ${x.spot}` : ""}</b>
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
        {job.pass ? (
          <section data-hpd-smoke="worker-chat" style={{ margin: "16px 0", padding: 12, borderRadius: 16, border: "2px solid #0a84ff" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 22 }}>💬 Chat with your boss</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }} data-hpd-smoke="worker-chat-list">
              {chat.length ? chat.map((m, i) => (
                <p key={i} data-hpd-smoke="worker-chat-msg" data-from={m.from} style={{ margin: 0, maxWidth: "85%", alignSelf: m.from === "worker" ? "flex-end" : "flex-start", padding: "8px 12px", borderRadius: 14, background: m.from === "worker" ? "#0a84ff" : "rgba(120,120,128,.22)", color: m.from === "worker" ? "#fff" : "inherit", fontSize: 17, whiteSpace: "pre-wrap" }}>
                  <small style={{ display: "block", opacity: 0.75, fontSize: 12 }}>{m.from === "worker" ? "You" : "Boss"} · {new Date(m.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>{m.text}
                </p>
              )) : <small style={{ opacity: 0.7 }}>Ask your boss anything about this job here (no WhatsApp needed).</small>}
            </div>
            <form style={{ display: "flex", gap: 8, marginTop: 10 }} onSubmit={async (e) => { e.preventDefault(); const t = draft.trim(); if (!t || chatBusy) return; setChatBusy(true); if (await talk(t)) setDraft(""); setChatBusy(false); }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={1000} placeholder="Write to your boss…" data-hpd-smoke="worker-chat-input" style={{ flex: 1, fontSize: 17, padding: 10, borderRadius: 12, border: "1px solid #8e8e93", resize: "vertical" }} />
              <button type="submit" disabled={chatBusy || !draft.trim()} data-hpd-smoke="worker-chat-send" style={{ ...big, width: "auto", marginTop: 0, padding: "0 18px", fontSize: 18, opacity: chatBusy || !draft.trim() ? 0.5 : 1 }}>{chatBusy ? "…" : "Send"}</button>
            </form>
            {chatErr ? <small role="status" style={{ color: "#ff453a" }} data-hpd-smoke="worker-chat-error">{chatErr}</small> : null}
          </section>
        ) : null}
        {/* No WhatsApp step (owner, 25 Nov: "I don't need them to send me back on WhatsApp ... they're not labeled"): the
            photos only go to the job card; an old link without the upload pass says so. */}
        {!job.pass ? <p data-hpd-smoke="worker-old-link" style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,69,58,.15)", fontWeight: 700, fontSize: 18 }}>⚠️ This is an old link: your photos can&apos;t reach the job card from it. Ask your boss to send you the job again, then take the photos from the new link.</p> : null}
        <button type="button" style={{ ...big, background: finished ? "#6e6e73" : "#ff9f0a" }} data-hpd-smoke="worker-done" onClick={async () => {
          const f = !finished; save(done, f);
          if (!f) return;
          const b = Math.max(items.filter((x) => x.side === "before").length, sentCount.before), a = Math.max(items.filter((x) => x.side === "after").length, sentCount.after);
          const text = `HPD job ${job.id} is done. Before: ${b}, after: ${a}${job.pass ? " (on the job card)" : ""}.`;
          if (job.pass) { if (await talk(text)) setMsg("✓ Your boss sees it in the chat below."); return; }
          const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
          try { if (nav.share) { await nav.share({ text }); setMsg("Sent."); } else { await navigator.clipboard.writeText(text); setMsg("Copied: paste it in a text to your boss."); } } catch { setMsg("Marked done on this phone."); }
        }}>{finished ? "✓ Done (tap to undo)" : "✅ Job done"}</button>
        {msg ? <p role="status" data-hpd-smoke="worker-msg">{msg}</p> : null}
        <p style={{ opacity: 0.6, fontSize: 15, marginTop: 24 }}>Only your job is shown here.</p>
      </div>
    </main>
  );
}
