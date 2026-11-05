"use client";

import { useEffect, useState } from "react";
import { loadNotes, notesFor, type ChatNote } from "../../lib/voice-notes";
import { addJobNote, loadJobNotes, removeJobNote } from "../../lib/job-notes";

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
    </div>
  </section>;
}
