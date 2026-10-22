// Find any job from a few words (owner, 22 Oct: "type a small description and it should guide me to the job; search
// by address or job"): every word must be found in the job number, the address, the borough or HPD's description,
// spelled loosely ("mini split" = "mini-split" = "minisplit", "condensor" = "condenser"). Job numbers first, then
// addresses, then descriptions; newer first.

export type SearchItem = { omo: string; kinds: string[]; address?: string; boro?: string; desc?: string; date?: string; due?: string; amount?: number; won?: string; apt?: string; file?: string };

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Same word, different spelling.
const SAME: [RegExp, string][] = [[/\bcondensor\b/g, "condenser"], [/\bac\b|\ba c\b/g, "aircon"], [/\bair condition(er|ing)?\b/g, "aircon"], [/\bsheetrock\b|\bgypsum\b/g, "drywall"], [/\bwc\b|\btoilet\b/g, "toilet"], [/\bst\b/g, "street"], [/\bave\b/g, "avenue"], [/\brd\b/g, "road"], [/\bblvd\b/g, "boulevard"], [/\bpl\b/g, "place"]];
const words = (s: string) => { let t = norm(s); for (const [re, w] of SAME) t = t.replace(re, w); return t; };

export function searchJobs(items: SearchItem[], query: string, limit = 30) {
  const q = words(query);
  if (q.replace(/\s/g, "").length < 2) return [];
  const terms = q.split(" ").filter(Boolean);
  const omoQ = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const out: { item: SearchItem; score: number; where: "omo" | "address" | "desc" }[] = [];
  for (const it of items) {
    const addr = words(`${it.address || ""} ${it.boro || ""}`);
    const desc = words(it.desc || "");
    const all = `${it.omo.toLowerCase()} ${addr} ${desc}`;
    const squashed = all.replace(/\s/g, "");
    if (!terms.every((t) => all.includes(t) || (t.length >= 4 && squashed.includes(t))) && !squashed.includes(q.replace(/\s/g, ""))) continue;
    const isOmo = omoQ.length >= 4 && it.omo.includes(omoQ);
    const inAddr = terms.every((t) => addr.includes(t));
    const where = isOmo ? "omo" : inAddr ? "address" : "desc";
    const recency = Date.parse(it.date || it.due || "") || 0;
    out.push({ item: it, where, score: (isOmo ? 3e13 : inAddr ? 2e13 : 1e13) + (it.kinds.includes("yours") ? 5e12 : 0) + recency / 1000 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// The words that matched, for showing a short piece of the description around them.
export function snippet(desc: string, query: string, len = 140) {
  const t = String(desc || "");
  const terms = words(query).split(" ").filter((w) => w.length > 2);
  const low = t.toLowerCase();
  let at = -1;
  for (const w of terms) { const i = low.indexOf(w.slice(0, 5)); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return t.slice(0, len) + (t.length > len ? "…" : "");
  const start = Math.max(0, at - 40);
  return (start ? "…" : "") + t.slice(start, start + len) + (start + len < t.length ? "…" : "");
}

// What the phone heard -> what to search (22 Oct, 🎤 voice search): "E R 0 8 2 8 3" / "er 08283" -> "ER08283",
// "three six one nine bedford" stays words (the phone writes numbers as digits itself).
export function spokenSearch(heard: string) {
  let t = String(heard || "").trim().replace(/[.?!]+$/, "");
  t = t.replace(/\b([a-z])\s*([a-z])\s*[- ]?\s*((?:\d\s*){4}\d)\b/gi, (_, a: string, b: string, d: string) => `${a}${b}${d.replace(/\s/g, "")}`.toUpperCase());
  t = t.replace(/^(find|search( for)?|look( for)?|show( me)?)\s+(the\s+)?(job\s+)?(with\s+)?(the\s+)?/i, "");
  return t.trim();
}

// The last searches on this phone (chips under the search box).
const RECENT = "hpd-recent-searches";
export function recentSearches(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT) || "[]"); return Array.isArray(v) ? v.slice(0, 6) : []; } catch { return []; }
}
export function rememberSearch(q: string) {
  const t = q.trim();
  if (t.length < 3) return;
  try { localStorage.setItem(RECENT, JSON.stringify([t, ...recentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6))); } catch { /* private mode */ }
}
