// Papers that run out (insurance, license, certificates): kept on this phone only (no names or numbers, just a label and a date).
export type Paper = { id: string; name: string; expires: string };
export const PAPERS_KEY = "hpd-papers";
export const PAPER_WARN_DAYS = 30;

export function loadPapers(): Paper[] {
  try {
    const v = JSON.parse(localStorage.getItem(PAPERS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.expires)) : [];
  } catch { return []; }
}
export function savePapers(list: Paper[]) {
  try { localStorage.setItem(PAPERS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}
export function daysLeft(expires: string, nowMs: number): number {
  return Math.round((Date.parse(`${expires}T12:00:00`) - nowMs) / 86400000);
}
export function paperState(days: number): "expired" | "soon" | "ok" {
  return days < 0 ? "expired" : days <= PAPER_WARN_DAYS ? "soon" : "ok";
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
// Finds a date in words ("expires June 13, 2027", "6/13/27", "2027-06-13", "13 Jun 2027"). Returns YYYY-MM-DD or "".
export function findDate(text: string): string {
  const t = String(text || "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "");
  let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) { const r = ok(+m[1], +m[2], +m[3]); if (r) return r; }
  m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const r = ok(y, +m[1], +m[2]); if (r) return r; }
  m = t.match(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"));
  if (m) { const r = ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]); if (r) return r; }
  m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON},?\\s+(\\d{4})\\b`, "i"));
  if (m) { const r = ok(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]); if (r) return r; }
  return "";
}
// "general liability insurance expires June 13 2027" -> { name, expires }
export function parsePaperSpeech(text: string): { name: string; expires: string } {
  const expires = findDate(text);
  const name = String(text || "")
    .replace(new RegExp(`\\b${MON}\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"), " ")
    .replace(new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+${MON},?\\s+\\d{4}\\b`, "gi"), " ")
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, " ")
    .replace(/\b(expires?|expiring|expiration|valid until|until|runs out|renewal|renews)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  return { name: name.slice(0, 60), expires };
}
export function expiringSoon(list: Paper[], nowMs: number): Paper[] {
  return list.filter((p) => daysLeft(p.expires, nowMs) <= PAPER_WARN_DAYS).sort((a, b) => a.expires.localeCompare(b.expires));
}
