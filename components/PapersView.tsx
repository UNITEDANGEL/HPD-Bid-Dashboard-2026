"use client";
// Your papers that run out (insurance, license, certificates): add each with its date by typing, saying it, or a photo;
// the app warns 30 days before. Kept on this phone only.
import { useEffect, useRef, useState } from "react";
import { daysLeft, findDate, loadPapers, parsePaperSpeech, paperState, savePapers, type Paper } from "../lib/papers";

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export default function PapersView() {
  const [list, setList] = useState<Paper[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setList(loadPapers()); setNow(Date.now()); }, []);
  const store = (next: Paper[]) => { setList(next); savePapers(next); };
  const add = () => {
    const n = name.trim();
    if (!n) { setMsg("Type or say what the paper is (like General liability insurance)."); return; }
    if (!date) { setMsg("Pick the date it runs out."); return; }
    store([...list.filter((p) => p.name.toLowerCase() !== n.toLowerCase()), { id: `p${Date.now()}`, name: n, expires: date }]);
    setName(""); setDate(""); setMsg(`Saved. I will warn you 30 days before ${day(date)}.`);
  };
  const say = () => {
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) { setMsg("This phone can't listen here. Type it instead, or use the keyboard's microphone."); return; }
    const r = new R(); r.lang = "en-US"; r.interimResults = false;
    setMsg("Listening… say it like: general liability insurance expires June 13 2027");
    r.onresult = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const p = parsePaperSpeech(String(e.results?.[0]?.[0]?.transcript || ""));
      if (p.name) setName(p.name);
      if (p.expires) setDate(p.expires);
      setMsg(p.expires ? "Check the name and date, then tap Save." : "I didn't hear the date. Pick it below.");
    };
    r.onerror = () => setMsg("I couldn't hear that. Type it instead.");
    try { r.start(); } catch { setMsg("Tap again in a moment."); }
  };
  const photo = async (file?: File | null) => {
    if (!file) return;
    setMsg("Reading the photo…");
    try {
      const image = await shrink(file);
      const r = await fetch("/api/drive/hpd-photo", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || d.reconnectRequired) { setMsg("Reading photos needs this phone signed in with Google. Sign in on the map screen, or type the date."); return; }
      const found = d.ai && d.text ? findDate(String(d.text)) : "";
      if (found) { setDate(found); setMsg("I found a date on the paper. Check it and the name, then tap Save."); }
      else setMsg("I couldn't find a date on that photo. Pick the date below.");
    } catch { setMsg("No connection right now. Type the date instead."); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const sorted = [...list].sort((a, b) => a.expires.localeCompare(b.expires));
  return (
    <main className="home pay" data-hpd-smoke="papers">
      <header className="home-head">
        <a className="home-logo" href="/" aria-label="Home">HPD</a>
        <div><h1>Your papers</h1><p>Insurance, license, certificates: I warn you 30 days before one runs out</p></div>
      </header>
      <section className="pay-card" data-hpd-smoke="papers-add">
        <h2>Add a paper</h2>
        <input className="papers-in" data-hpd-smoke="papers-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What is it? (General liability insurance)" aria-label="Paper name" />
        <input className="papers-in" data-hpd-smoke="papers-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date it runs out" />
        <div className="papers-row">
          <button type="button" className="pay-link" data-hpd-smoke="papers-save" onClick={add}>Save</button>
          <button type="button" className="pay-link" data-hpd-smoke="papers-say" onClick={say}>🎤 Say it</button>
          <button type="button" className="pay-link" data-hpd-smoke="papers-photo" onClick={() => fileRef.current?.click()}>📷 Photo</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden data-hpd-smoke="papers-file" onChange={(e) => photo(e.target.files?.[0])} />
        </div>
        {msg ? <p data-hpd-smoke="papers-msg" role="status">{msg}</p> : null}
      </section>
      <section className="pay-card" data-hpd-smoke="papers-list">
        <h2>{sorted.length ? `${sorted.length} paper${sorted.length === 1 ? "" : "s"}` : "No papers yet"}</h2>
        <ol>{sorted.map((p) => {
          const d = daysLeft(p.expires, now || Date.now());
          const s = paperState(d);
          return (
            <li key={p.id} className={s === "ok" ? "" : "is-late"} data-hpd-smoke="papers-item" data-state={s}>
              <b>{p.name}</b>
              <span>{s === "expired" ? `⚠️ ran out ${-d} day${d === -1 ? "" : "s"} ago` : s === "soon" ? `⚠️ ${d} day${d === 1 ? "" : "s"} left` : `${d} days left`}</span>
              <small>{day(p.expires)} · <button type="button" className="papers-del" data-hpd-smoke="papers-del" onClick={() => store(list.filter((x) => x.id !== p.id))}>Remove</button></small>
            </li>
          );
        })}</ol>
      </section>
    </main>
  );
}
