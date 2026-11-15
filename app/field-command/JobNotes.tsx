"use client";

import { useEffect, useState } from "react";
import { loadNotes, notesFor, type ChatNote } from "../../lib/voice-notes";
import { addJobNote, loadJobNotes, removeJobNote } from "../../lib/job-notes";
import { saidJobNote } from "../../lib/job-say-note";

type Rec = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null; start(): void; stop(): void };

// 📝 Notes on the job card (owner ideas, 3 Nov): what you told the chat to remember about this address, and notes you type
// here (gate code, who to ask for). Kept on this phone only; shown before you knock.
export default function JobNotes({ jobId, address }: { jobId: string; address: string }) {
  const [typed, setTyped] = useState<ChatNote[]>([]);
  const [chat, setChat] = useState<ChatNote[]>([]);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setTyped(loadJobNotes(jobId));
    setChat(notesFor(address, loadNotes()));
  }, [jobId, address]);
  useEffect(() => { const on = () => setTyped(loadJobNotes(jobId)); window.addEventListener("hpd-job-notes-changed", on); return () => window.removeEventListener("hpd-job-notes-changed", on); }, [jobId]);
  // 🎤 Say a note after the job: the app writes down what you said, dated (idea, 14 Nov).
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const [micMsg, setMicMsg] = useState("");
  useEffect(() => { const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; setCanListen(!!(w.SpeechRecognition || w.webkitSpeechRecognition)); }, []);
  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    let heard = "";
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e) => { heard = Array.from(e.results).map((r) => r[0]?.transcript || "").join(" "); };
    rec.onerror = (e) => { if (e?.error === "not-allowed") setMicMsg("The microphone is off for this app: allow it in Settings."); };
    rec.onend = () => {
      setListening(false);
      const note = saidJobNote(heard);
      if (note) { setTyped(addJobNote(jobId, note)); setMicMsg("✓ Saved on the job."); } else setMicMsg((m) => m || "I didn't hear anything. Tap the mic and try again.");
    };
    setMicMsg(""); setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  const save = () => {
    if (!draft.trim()) return;
    setTyped(addJobNote(jobId, draft));
    setDraft("");
  };
  return <section className="jc-notes" data-hpd-smoke="jc-notes">
    <strong>📝 Notes</strong>
    {chat.map((n) => <p key={`c${n.at}`} className="jc-note" data-hpd-smoke="jc-note-chat">🤖 You told the chat: {n.text}</p>)}
    {typed.map((n, i) => <p key={`t${n.at}`} className="jc-note" data-hpd-smoke="jc-note">{n.text} <button type="button" aria-label="Remove this note" onClick={() => setTyped(removeJobNote(jobId, i))}>×</button></p>)}
    {!chat.length && !typed.length ? <span className="jc-note-empty">Nothing yet. Add the gate code or who to ask for.</span> : null}
    <div className="jc-note-add">
      <input type="text" value={draft} placeholder="Gate code, who to ask for…" data-hpd-smoke="jc-note-input" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      <button type="button" data-hpd-smoke="jc-note-save" onClick={save}>Save</button>
      {canListen ? <button type="button" data-hpd-smoke="jc-note-say" aria-label="Say what you did" style={{ minHeight: 44 }} onClick={listen} disabled={listening}>{listening ? "🎤 Listening…" : "🎤 Say it"}</button> : null}
    </div>
    {micMsg ? <span className="jc-note-empty" data-hpd-smoke="jc-note-say-msg">{micMsg}</span> : null}
  </section>;
}
