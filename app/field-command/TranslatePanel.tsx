"use client";
// 🔁 Talk with the tenant in their language (owner idea, 4 Nov): the tenant holds the mic and speaks Spanish, Chinese or
// Russian, the helper says it in English; you answer in English and it says it back in theirs. Each line goes to the
// app's own translator (Cloudflare's free model) and nothing is kept. Typing works too.
import { useEffect, useRef, useState } from "react";
import { speak, speakIn } from "../../lib/speak";

export const TRANSLATE_LANGS = [
  { code: "es", rec: "es-US", label: "Español", name: "Spanish", hold: "Mantenga presionado y hable" },
  { code: "zh", rec: "zh-CN", label: "中文", name: "Chinese", hold: "按住说话" },
  { code: "ru", rec: "ru-RU", label: "Русский", name: "Russian", hold: "Нажмите и говорите" },
] as const;
type Lang = (typeof TRANSLATE_LANGS)[number];
type Line = { who: "tenant" | "me"; said: string; out: string; at: number };

export async function translateLine(text: string, from: string, to: string): Promise<string> {
  try {
    const r = await fetch("/api/drive/hpd-translate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, from, to }) });
    const j = r.ok ? await r.json() : null;
    return j?.ai && j.text ? String(j.text) : "";
  } catch { return ""; }
}

type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; continuous?: boolean; start: () => void; stop: () => void; abort?: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };

export default function TranslatePanel({ startLang = "es", onClose }: { startLang?: string; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>(TRANSLATE_LANGS.find((l) => l.code === startLang) || TRANSLATE_LANGS[0]);
  const [lines, setLines] = useState<Line[]>([]);
  const [listening, setListening] = useState<"" | "tenant" | "me">("");
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const recRef = useRef<Rec | null>(null);
  const heardRef = useRef("");
  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* already stopped */ } }, []);

  async function run(who: "tenant" | "me", said: string) {
    const text = said.trim();
    if (!text) return;
    setBusy(true); setErr("");
    const out = await translateLine(text, who === "tenant" ? lang.code : "en", who === "tenant" ? "en" : lang.code);
    setBusy(false);
    if (!out) { setErr("The translator didn't answer (no signal?). Try again."); return; }
    setLines((l) => [...l.slice(-7), { who, said: text, out, at: Date.now() }]);
    if (who === "tenant") speak(out, 0);
    else if (!speakIn(out, lang.rec)) setErr(`This phone has no ${lang.name} voice: show the tenant the words on the screen.`);
  }

  function listen(who: "tenant" | "me") {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) { setErr("This phone can't listen here: type it below."); return; }
    if (listening) { try { recRef.current?.stop(); } catch { /* stopped */ } return; }
    try { window.speechSynthesis?.cancel(); } catch { /* no voice */ }
    const rec = new Ctor();
    rec.lang = who === "tenant" ? lang.rec : "en-US"; rec.interimResults = true; rec.maxAlternatives = 1;
    heardRef.current = "";
    rec.onresult = (e) => { heardRef.current = Array.from(e.results).map((r) => r[0]?.transcript || "").join(" "); };
    rec.onerror = (e) => { if (e?.error && e.error !== "no-speech" && e.error !== "aborted") setErr(e.error === "not-allowed" ? "The microphone is off for this app: allow it in Settings." : "I didn't catch that. Try again."); };
    rec.onend = () => { setListening(""); recRef.current = null; void run(who, heardRef.current); };
    recRef.current = rec; setListening(who); setErr("");
    try { rec.start(); } catch { setListening(""); }
  }

  const last = lines[lines.length - 1];
  return (
    <div className="fc-translate" role="dialog" aria-label="Talk with the tenant" data-hpd-smoke="fc-translate">
      <div className="fc-translate-head">
        <b>🔁 Talk with the tenant</b>
        <button type="button" className="fc-translate-x" aria-label="Close" data-hpd-smoke="fc-translate-close" onClick={onClose}>✕</button>
      </div>
      <div className="fc-translate-langs">
        {TRANSLATE_LANGS.map((l) => <button key={l.code} type="button" aria-pressed={l.code === lang.code} data-hpd-smoke="fc-translate-lang" data-lang={l.code} onClick={() => setLang(l)}>{l.label}</button>)}
      </div>
      {last ? (
        <div className={`fc-translate-big is-${last.who}`} data-hpd-smoke="fc-translate-big">
          <small>{last.who === "tenant" ? `Tenant (${lang.name}) said:` : `For the tenant (${lang.label}):`}</small>
          <p lang={last.who === "tenant" ? "en" : lang.code} data-hpd-smoke="fc-translate-out">{last.out}</p>
          <span>“{last.said}”</span>
        </div>
      ) : <p className="fc-translate-tip">Hand the phone to the tenant and hold their button, or hold yours and speak English.</p>}
      {lines.length > 1 ? (
        <ol className="fc-translate-log" data-hpd-smoke="fc-translate-log">
          {lines.slice(0, -1).reverse().map((l) => <li key={l.at} className={`is-${l.who}`}><b>{l.who === "tenant" ? "Tenant" : "You"}:</b> {l.who === "tenant" ? l.out : l.said}</li>)}
        </ol>
      ) : null}
      {err ? <p className="fc-translate-err" role="alert">{err}</p> : null}
      <div className="fc-translate-mics">
        <button type="button" className={`is-tenant${listening === "tenant" ? " is-on" : ""}`} data-hpd-smoke="fc-translate-tenant" disabled={busy} onClick={() => listen("tenant")}>🎤 {lang.label}<small>{listening === "tenant" ? "…" : lang.hold}</small></button>
        <button type="button" className={`is-me${listening === "me" ? " is-on" : ""}`} data-hpd-smoke="fc-translate-me" disabled={busy} onClick={() => listen("me")}>🎤 English<small>{listening === "me" ? "Listening… tap to stop" : "You speak"}</small></button>
      </div>
      <form className="fc-translate-type" onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(""); void run("me", t); }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type in English → ${lang.label}`} aria-label="Type to translate" data-hpd-smoke="fc-translate-input" />
        <button type="submit" disabled={busy || !typed.trim()} data-hpd-smoke="fc-translate-send">{busy ? "…" : "Say it"}</button>
      </form>
    </div>
  );
}
