// Things the owner tells the chat to remember (3 Nov idea: "remember the super at 123 Main is in the basement").
// Kept on the phone only; brought back when that address comes up.

export type ChatNote = { text: string; at: string };

export function parseRemember(t: string): string | null {
  const m = /^(?:please |hey |ok |okay )?(?:remember|note|make a note|keep in mind)(?: that| this)?[\s,:-]+(.{4,})$/i.exec(t.trim());
  return m ? m[1].trim() : null;
}

export function isNotesQuestion(t: string): boolean {
  return /^(?:what (?:did i tell you|do you remember|notes do i have|have i told you)|(?:read|show) (?:me )?my notes|my notes|what did i ask you to remember)(?: please)?$/.test(t.trim());
}

// A note belongs to an address when it names the street number and the first street word, like "123 main".
function addressKey(address: string): { num: string; word: string } | null {
  const m = /^\s*(\d+[a-z]?)(?:-\d+)?\s+(?:(?:east|west|north|south|e|w|n|s)\.?\s+)?([a-z0-9]+)/i.exec(address);
  return m ? { num: m[1].toLowerCase(), word: m[2].toLowerCase() } : null;
}

export function notesFor(address: string, notes: ChatNote[]): ChatNote[] {
  const k = addressKey(address);
  if (!k) return [];
  const re = new RegExp(`\\b${k.num}\\b[^.]{0,20}\\b${k.word}`, "i");
  return notes.filter((n) => re.test(n.text));
}

export function loadNotes(): ChatNote[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem("hpd-chat-notes") || "[]");
    return Array.isArray(raw) ? raw.filter((n) => n && typeof n.text === "string") : [];
  } catch { return []; }
}

export function saveNote(text: string, at = new Date().toISOString()): ChatNote[] {
  const list = [...loadNotes(), { text, at }].slice(-100);
  try { window.localStorage.setItem("hpd-chat-notes", JSON.stringify(list)); } catch { /* storage full or blocked */ }
  return list;
}
