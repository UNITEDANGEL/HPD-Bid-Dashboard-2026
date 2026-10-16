// A clean summary of an invitation's job description, so the job reads at a glance (HPD's full text stays
// underneath): what work, how much (square feet, rooms, doors, windows), the expensive parts (Secure Tech
// lock, electric strike) and where (apartment, floor, public hall). The same quantities feed "My price"
// (lib/my-rates.ts), so what you see is what your price is worked out from.
import { readScope } from "./bid-price";

export type Unit = "sqft" | "door" | "window" | "each" | "job";
export type SummaryLine = { key: string; label: string; qty: number; unit: Unit; detail: string };
export type JobSummary = { lines: SummaryLine[]; where: string[]; rooms: string[]; headline: string };

const WORD: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, both: 2, pair: 1 };

// How a kind of work is priced, and what you see next to it.
const UNIT: Record<string, Unit> = {
  floor: "sqft", sheetrock: "sqft", paint: "sqft", ceiling: "sqft", wall: "sqft", masonry: "sqft", roof: "sqft", mold: "sqft", lead: "sqft",
  closer: "door", hinges: "door", lock: "door", "entrance-lock": "door", pushbar: "door", "door-adjust": "door", "door-new": "door", "ada-closer": "door",
  glass: "window", "window-hardware": "window", "window-new": "window",
  "secure-tech": "each", "electric-strike": "each", detector: "each", plumbing: "job", leak: "job", intercom: "job",
};
export const unitOf = (key: string): Unit => UNIT[key] || "job";

// Material for floor / tile jobs.
function floorMaterial(text: string) {
  const m = /(ceramic|porcelain|quarry|marble|vct|vinyl composition|vinyl|linoleum|laminat\w*|hardwood|wood|parquet|terrazzo|rubber|carpet)\b/.exec(text);
  if (!m) return "";
  const word = m[1].startsWith("laminat") ? "laminate" : m[1] === "vinyl composition" ? "VCT" : m[1] === "vct" ? "VCT" : m[1];
  return word === "VCT" ? word : word[0].toUpperCase() + word.slice(1);
}

// "(2) electric strikes", "two new closers", "electric strike plates (3)"; else 0.
function countOf(text: string, noun: string) {
  let best = 0;
  for (const m of text.matchAll(new RegExp(`(?:\\(\\s*)?\\b(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|both)\\b(?:\\s*\\))?\\s+(?:new\\s+|defective\\s+|similar\\s+)?(?:\\w+\\s+)?${noun}`, "g"))) best = Math.max(best, WORD[m[1]] || Number(m[1]));
  for (const m of text.matchAll(new RegExp(`${noun}\\w*\\s*\\(\\s*(\\d{1,2})\\s*\\)`, "g"))) best = Math.max(best, Number(m[1]));
  return best;
}

const ROOMS: [RegExp, string][] = [
  [/\bkitchenette\b/, "kitchenette"], [/\bkitchen\b/, "kitchen"], [/\bbath(?:room)?\b/, "bathroom"], [/\bbed ?room\b|\bbr\b/, "bedroom"],
  [/\bliving ?room\b|\blr\b/, "living room"], [/\bdining\b/, "dining room"], [/\bfoyer\b/, "foyer"], [/private hall(?:way)?/, "private hallway"],
  [/public hall(?:way)?/, "public hall"], [/\bcloset\b/, "closet"], [/\bvestibule\b/, "vestibule"], [/\blobby\b/, "lobby"],
  [/\bstair(?:case|way|s)?\b/, "stairs"], [/\bbasement\b/, "basement"], [/\bcellar\b/, "cellar"], [/\broof\b(?! door)/, "roof"], [/\byard\b/, "yard"],
];

function where(text: string) {
  const out: string[] = [];
  const apt = /\bapt\.?\s*#?\s*([a-z]?\d{1,4}[a-z]?|[a-z]{1,2})\b/i.exec(text);
  if (apt) out.push(`Apt ${apt[1].toUpperCase()}`);
  const floor = /\b(\d{1,2})(?:st|nd|rd|th)\s*(?:fl(?:oor)?|story|sty)\b/.exec(text);
  if (floor) out.push(`${floor[1]}${["th", "st", "nd", "rd"][Number(floor[1]) % 10 > 3 || [11, 12, 13].includes(Number(floor[1]) % 100) ? 0 : Number(floor[1]) % 10]} floor`);
  if (/(?:building|bldg\.?)\s*(?:ent(?:rance)?|front)\b|\bentrance door\b|\bent door\b/.test(text)) out.push("building entrance");
  else if (/public (?:area|parts)/.test(text) && !/public hall/.test(text)) out.push("public area");
  return out;
}

// Square feet per kind of work: each "N sq ft" belongs to the work named just before it (paint / sheetrock /
// floor / glass; ceiling or wall removal is the sheetrock repair). "Remove 24 + 20 sq ft ... install 44 sq ft"
// is the same area, counted once; "... ceiling approx 120 sq ft and all walls approx 500 sq ft" keeps painting.
const SQFT_KIND: [kind: string, re: RegExp][] = [
  ["paint", /paint|coats?\b|primer|\bprime\b/g],
  ["sheetrock", /sheetrock|gwb|gypsum|drywall|plaster|spackle|skim/g],
  ["floor", /floor|tile|vct|linoleum|vinyl|laminat|carpet/g],
  ["glass", /glass|pane|plexi/g],
];
function sqftByKind(text: string) {
  const out: Record<string, number> = {};
  const runs: Record<string, number> = {};
  let prevEnd = 0, prevKind = "";
  for (const m of text.matchAll(/(\d{1,4}(?:\.\d+)?)\s*(?:sq\.?\s*f(?:ee)?t\.?|sqft|s\.?f\.?(?=[\s,.;)]|$)|square feet)/g)) {
    const before = text.slice(Math.max(prevEnd, m.index! - 160), m.index);
    let kind = "", at = -1;
    for (const [k, re] of SQFT_KIND) for (const w of before.matchAll(re)) if (w.index! >= at) { at = w.index!; kind = k; }
    // Ceiling / walls are places: with no trade named, removing damaged ceiling or wall is the sheetrock repair.
    if (!kind && /ceiling|walls?\b/.test(before)) kind = "sheetrock";
    // "... ceiling approx 120 sq ft and all walls approx 500 sq ft": a short "and ..." keeps the work before.
    if (prevKind && before.length < 90 && /^\W*and\b/.test(before.trim().replace(/^[.,;\s]+/, "")) ) kind = prevKind;
    if (!kind && prevKind && before.length < 90) kind = prevKind;
    prevEnd = m.index! + m[0].length;
    if (!kind) continue;
    const n = Number(m[1]);
    if (prevKind === kind && runs[kind] && Math.abs(n - runs[kind]) < 1) { runs[kind] = 0; continue; } // same area again (install = removed)
    if (prevKind !== kind) runs[kind] = 0;
    out[kind] = (out[kind] || 0) + n;
    runs[kind] = (runs[kind] || 0) + n;
    prevKind = kind;
  }
  return out;
}

export function jobSummary(description: string): JobSummary {
  const scope = readScope(description || "");
  const text = String(description || "").replace(/\s+/g, " ").toLowerCase().replace(/contractor must (contact|sign)[\s\S]*$/i, " ");
  const rooms = [...new Set(ROOMS.filter(([re]) => re.test(text)).map(([, name]) => name))];
  const area = sqftByKind(text);
  const sqftLines = scope.items.filter((k) => unitOf(k) === "sqft").length;
  const doors = Math.max(scope.doors, 0);
  const windows = Math.max(scope.windows, 0);
  const lines: SummaryLine[] = scope.items.map((key, i) => {
    const label = scope.labels[i];
    const unit = unitOf(key);
    let qty = 0, detail = "";
    if (unit === "sqft") {
      const own = key === "paint" ? area.paint : key === "floor" ? area.floor : ["sheetrock", "ceiling", "wall"].includes(key) ? area.sheetrock : 0;
      // Only one kind of work by the square foot: every sq ft in the text is that work's.
      qty = Math.round(own || (sqftLines === 1 ? (key === "paint" ? scope.paintSqft || scope.sqft : scope.repairSqft || scope.sqft) : 0));
      if (key === "floor") { const mat = floorMaterial(text); detail = mat ? `${mat} floor` : "floor / tile"; }
    } else if (unit === "door") {
      qty = doors || 1;
    } else if (unit === "window") {
      qty = windows || 1;
      if (key === "glass" && scope.glassSqft) detail = `~${scope.glassSqft} sq ft of glass`;
    } else if (unit === "each") {
      qty = key === "secure-tech" ? countOf(text, "secur") || 1 : key === "electric-strike" ? countOf(text, "(?:electric|electronic) strike") || 1 : countOf(text, "detector") || 1;
    } else {
      qty = 1;
      if (key === "leak") detail = /trace/.test(text) ? "trace the source & repair" : "repair";
    }
    return { key, label, qty, unit, detail };
  });
  const amount = (l: SummaryLine) => (l.unit === "sqft" ? (l.qty ? `${l.qty} sq ft` : "size not given") : l.unit === "door" ? `${l.qty} door${l.qty === 1 ? "" : "s"}` : l.unit === "window" ? `${l.qty} window${l.qty === 1 ? "" : "s"}` : l.unit === "each" ? `×${l.qty}` : "");
  const headline = lines.length
    ? lines.map((l) => [l.detail && l.key === "floor" ? l.detail : l.label, amount(l)].filter(Boolean).join(" · ")).join(" + ")
    : "general repair";
  return { lines, where: where(text), rooms, headline };
}

// What a line shows: "Vinyl floor · 120 sq ft", "Secure Tech lock ×1", "Door closer · 2 doors".
export function lineText(l: SummaryLine) {
  const name = l.key === "floor" && l.detail ? l.detail : l.label[0].toUpperCase() + l.label.slice(1);
  const q = l.unit === "sqft" ? (l.qty ? `${l.qty} sq ft` : "size not given") : l.unit === "door" ? `${l.qty} door${l.qty === 1 ? "" : "s"}` : l.unit === "window" ? `${l.qty} window${l.qty === 1 ? "" : "s"}` : l.unit === "each" ? `×${l.qty}` : "";
  const extra = l.key !== "floor" && l.detail ? ` (${l.detail})` : "";
  return [name + extra, q].filter(Boolean).join(" · ");
}
