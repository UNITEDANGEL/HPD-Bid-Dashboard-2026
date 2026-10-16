// Bid calculator (owner, 16 Oct 2026): the price built line by line. Each line of the job (lib/job-summary.ts)
// at your rate (lib/my-rates.ts), plus the extras the job description tells: floors up the stairs, more than one
// location, the borough (travel). Any line can be changed for this job only, and the whole total moved up or
// down by a percent ("does this sound right?"). Rates for the extras are yours too: "x-floor" (per floor above
// the 2nd), "x-location" (per location after the first), "x-borough-MN" ... (per job in that borough).
import type { JobSummary } from "./job-summary";
import { myPrice, unitWord, type Rates } from "./my-rates";

export type CalcContext = { floor: number; locations: number; borough: string };
export type CalcLine = { key: string; label: string; qty: number; unit: string; rate: number | null; amount: number | null; overridden: boolean; why: string; extra: boolean };
export type Calc = { lines: CalcLine[]; subtotal: number; adjustPct: number; total: number; complete: boolean; missing: number };

const BORO: Record<string, string> = { MN: "Manhattan", BX: "the Bronx", BK: "Brooklyn", QN: "Queens", SI: "Staten Island" };
export const boroughCode = (b: string) => {
  const t = String(b || "").toUpperCase();
  if (/^(MN|BX|BK|QN|SI)$/.test(t)) return t;
  return /MANHATTAN/.test(t) ? "MN" : /BRONX/.test(t) ? "BX" : /BROOKLYN/.test(t) ? "BK" : /QUEENS/.test(t) ? "QN" : /STATEN/.test(t) ? "SI" : "";
};

// What the description says about where the work is: the highest floor named, how many places (rooms / numbered
// tasks), and the borough.
export function calcContext(summary: JobSummary, tasks: number, borough: string): CalcContext {
  const floors = summary.where.map((w) => Number((/^(\d+)\w*\s+floor$/.exec(w) || [])[1] || 0));
  const places = summary.rooms.filter((r) => !/public hall|stairs/.test(r)).length;
  return { floor: Math.max(0, ...floors), locations: Math.max(1, tasks || 1, places), borough: boroughCode(borough) };
}

export function calcPrice(summary: JobSummary, rates: Rates, ctx: CalcContext, overrides: Record<string, number> = {}, adjustPct = 0): Calc {
  const work = myPrice(summary, rates).rows.map((r): CalcLine => ({
    key: r.line.key, label: r.line.label, qty: r.line.qty, unit: unitWord(r.line.unit), rate: r.rate,
    amount: overrides[r.line.key] ?? r.amount, overridden: overrides[r.line.key] !== undefined, why: r.why, extra: false,
  }));
  const extra = (key: string, label: string, qty: number, unit: string): CalcLine => {
    const rate = rates[key] || null;
    const amount = overrides[key] ?? (rate ? Math.round(rate * qty) : null);
    return { key, label, qty, unit, rate, amount, overridden: overrides[key] !== undefined, why: rate ? "" : "no rate yet", extra: true };
  };
  const extras: CalcLine[] = [];
  if (ctx.floor > 2) extras.push(extra("x-floor", `Floors up the stairs (${ctx.floor}th floor: ${ctx.floor - 2} above the 2nd)`.replace(/(\d)th floor/, (m, d) => `${d}${({ "1": "st", "2": "nd", "3": "rd" } as Record<string, string>)[d] || "th"} floor`), ctx.floor - 2, "per floor"));
  if (ctx.locations > 1) extras.push(extra("x-location", `More locations (${ctx.locations} in this job)`, ctx.locations - 1, "per extra location"));
  if (ctx.borough) extras.push(extra(`x-borough-${ctx.borough}`, `Travel: ${BORO[ctx.borough]}`, 1, "per job"));
  const lines = [...work, ...extras];
  const subtotal = lines.reduce((sum, l) => sum + (l.amount || 0), 0);
  const total = Math.round(subtotal * (1 + adjustPct / 100));
  // Extras with no rate don't block the price (you may not charge for them); work lines do.
  const missing = work.filter((l) => l.amount === null).length;
  return { lines, subtotal, adjustPct, total, complete: work.length > 0 && missing === 0, missing };
}
