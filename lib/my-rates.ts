// Your own rates (what you charge): per square foot (floor / tile, sheetrock, painting), per door (closer,
// hinges, locks), per window, per part (Secure Tech lock, electric strike) or per job (leak, plumbing).
// "My price" for an invitation = each line of the job summary (lib/job-summary.ts) × your rate for it.
// Kept on this phone, never published.
import type { JobSummary, SummaryLine, Unit } from "./job-summary";

export type Rates = Record<string, number>;
const KEY = "hpd-my-rates";

export const unitWord = (u: Unit) => (u === "sqft" ? "per sq ft" : u === "door" ? "per door" : u === "window" ? "per window" : u === "each" ? "each" : "per job");

export function readRates(): Rates {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "number" && v > 0)) as Rates;
  } catch {
    return {};
  }
}

export function saveRate(key: string, amount: number | null): Rates {
  const next = { ...readRates() };
  if (amount && amount > 0) next[key] = Math.round(amount * 100) / 100;
  else delete next[key];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts this visit */ }
  return next;
}

export type PriceRow = { line: SummaryLine; rate: number | null; amount: number | null; why: string };

// Each line priced at your rate. A per-sq-ft line with no size in the description can't be priced (say so).
export function myPrice(summary: JobSummary, rates: Rates) {
  const rows: PriceRow[] = summary.lines.map((line) => {
    const rate = rates[line.key] || null;
    if (!rate) return { line, rate, amount: null, why: "no rate yet" };
    if (line.unit === "sqft" && !line.qty) return { line, rate, amount: null, why: "no size in the description" };
    const qty = line.unit === "job" ? 1 : line.qty || 1;
    return { line, rate, amount: Math.round(rate * qty), why: "" };
  });
  const priced = rows.filter((r) => r.amount !== null);
  const total = priced.reduce((sum, r) => sum + (r.amount || 0), 0);
  return { rows, total, complete: priced.length === rows.length && rows.length > 0, missing: rows.filter((r) => r.amount === null).length };
}
