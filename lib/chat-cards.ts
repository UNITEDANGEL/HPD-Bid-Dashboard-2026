// The chat on the map (owner, 2 Nov, parts 3 and 4): answers come with cards you can tap (a job, a bid with its price,
// a notice with Answer), and the chat brings up what matters by itself (a nudge), each one once.

export type ChatCard = { kind: "job" | "bid" | "notice"; id: string; title: string; sub: string; tag?: string };

// The job numbers named in an answer, in order, once each ("ER08092", "EQ15239").
export function omosIn(text: string) {
  return [...new Set(String(text || "").match(/\b[A-Z]{2}\d{5}\b/g) || [])];
}

// Nudges already shown and closed (or acted on) on this phone: not brought up again.
const SEEN_KEY = "hpd-nudges-seen";
export function nudgesSeen(): string[] {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function markNudgeSeen(key: string) {
  const next = [...nudgesSeen().filter((k) => k !== key), key].slice(-150);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}
