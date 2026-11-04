// Notes typed on a job card (3 Nov idea "Notes on every job"): gate code, who to ask for. Kept on the phone only.
import type { ChatNote } from "./voice-notes";

const KEY = "hpd-job-notes";

function all(): Record<string, ChatNote[]> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

function write(map: Record<string, ChatNote[]>) {
  try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage full or blocked */ }
}

export function loadJobNotes(jobId: string): ChatNote[] {
  const list = all()[jobId];
  return Array.isArray(list) ? list.filter((n) => n && typeof n.text === "string") : [];
}

export function addJobNote(jobId: string, text: string, at = new Date().toISOString()): ChatNote[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 300);
  const map = all();
  const list = clean ? [...loadJobNotes(jobId), { text: clean, at }].slice(-20) : loadJobNotes(jobId);
  map[jobId] = list;
  write(map);
  return list;
}

export function removeJobNote(jobId: string, index: number): ChatNote[] {
  const map = all();
  const list = loadJobNotes(jobId).filter((_, i) => i !== index);
  map[jobId] = list;
  write(map);
  return list;
}
