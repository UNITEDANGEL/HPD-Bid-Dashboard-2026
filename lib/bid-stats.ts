// Bid stats: every invitation you received that HPD awarded, yours or another contractor's, with the
// price it was won at (NYC Open Data). Grouped by kind of work and by area, it shows where you win, what
// winners charge, and where your price is too low (money left on the table) or too high (jobs lost).
// For jobs you won, the award is your bid. For jobs you lost, your own bid is known only for bids sent
// from this app; the winning price is known for all of them.
import { readScope } from "./bid-price";

export type MarketJob = { omo: string; amount: number; awardDate: string; won: boolean; boro?: string; zip?: string; area?: string; address?: string; description: string };

const TRADES: [name: string, items: string[]][] = [
  ["Doors & locks", ["door-new", "closer", "lock", "hinges", "pushbar", "door-adjust"]],
  ["Windows & glass", ["glass", "window-hardware", "window-new"]],
  ["Leaks, plaster & paint", ["leak", "sheetrock", "paint", "ceiling", "wall", "mold"]],
  ["Floors & tile", ["floor"]],
  ["Plumbing", ["plumbing"]],
  ["Electrical & detectors", ["electric", "detector"]],
  ["Outside: fire escape, masonry, roof", ["fire-escape", "masonry", "metal", "roof"]],
];

// The main kind of work: the first trade any of its items belongs to; several trades -> "Mixed".
export function tradeOf(description: string) {
  const items = readScope(description).items;
  const trades = TRADES.filter(([, keys]) => items.some((k) => keys.includes(k))).map(([name]) => name);
  return trades.length === 1 ? trades[0] : trades.length > 1 ? "Mixed / several trades" : "Other";
}

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const daysBefore = (date: string, now: Date) => (now.getTime() - Date.parse(date)) / 86400000;

// The same work at the same size: "closer+lock | 1 unit", "leak+paint+sheetrock | 50-200 sq ft".
function workKey(description: string) {
  const s = readScope(description);
  const units = s.doors + s.windows;
  const size = units >= 4 ? "4+ units" : units >= 2 ? "2-3 units" : s.sqft >= 200 ? "200+ sqft" : s.sqft >= 50 ? "50-200 sqft" : s.sqft > 0 ? "<50 sqft" : "1 unit";
  return `${[...s.items].sort().join("+") || "other"} | ${size}`;
}

type Row = MarketJob & { trade: string; key: string };

export type Group = {
  name: string; invitations: number; won: number; winRate: number;
  yourPrice: number;     // your typical winning price
  othersPrice: number;   // typical price other contractors won at
  under: number | null;  // your wins vs others' wins for the same work and size (0.8 = you were 20% under)
  beaten: number | null; // others' wins vs your usual price for the same work (0.9 = they came in 10% under you)
  moneyWon: number; moneyLost: number;
  advice: "raise" | "lower" | "ok" | "few";
  recent: number; before: number; change: number | null; // winning prices, last 90 days vs 9 months before
};

type Prices = { others: Map<string, number>; yours: Map<string, number> };

function group(name: string, jobs: Row[], prices: Prices, now: Date): Group {
  const mine = jobs.filter((j) => j.won), others = jobs.filter((j) => !j.won);
  const ratio = (list: Row[], ref: Map<string, number>) => {
    const r = list.filter((j) => ref.get(j.key)).map((j) => j.amount / ref.get(j.key)!);
    return r.length >= 3 ? Math.round(median(r) * 100) / 100 : null;
  };
  const under = ratio(mine, prices.others), beaten = ratio(others, prices.yours);
  const winRate = jobs.length ? mine.length / jobs.length : 0;
  const recentJobs = jobs.filter((j) => daysBefore(j.awardDate, now) <= 90), beforeJobs = jobs.filter((j) => daysBefore(j.awardDate, now) > 90 && daysBefore(j.awardDate, now) <= 365);
  const recent = Math.round(median(recentJobs.map((j) => j.amount))), before = Math.round(median(beforeJobs.map((j) => j.amount)));
  // Raise: your wins are well under what others win the same work for. Lower: you rarely win and the
  // winners came in under your usual price for that work. Too few jobs: no advice.
  const advice: Group["advice"] = jobs.length < 8 ? "few"
    : under != null && under <= 0.85 && mine.length >= 3 ? "raise"
    : beaten != null && beaten <= 0.95 && winRate < 0.2 ? "lower" : "ok";
  return {
    name, invitations: jobs.length, won: mine.length, winRate,
    yourPrice: Math.round(median(mine.map((j) => j.amount))), othersPrice: Math.round(median(others.map((j) => j.amount))), under, beaten,
    moneyWon: Math.round(mine.reduce((s, j) => s + j.amount, 0)), moneyLost: Math.round(others.reduce((s, j) => s + j.amount, 0)),
    advice, recent, before,
    change: recentJobs.length >= 4 && beforeJobs.length >= 4 && before ? Math.round(((recent - before) / before) * 100) : null,
  };
}

export function bidStats(jobs: MarketJob[], now = new Date()) {
  const rows: Row[] = jobs.filter((j) => j.amount > 0 && j.awardDate).map((j) => ({ ...j, trade: tradeOf(j.description), key: workKey(j.description) }));
  // Typical winning price of the same work at the same size: other contractors' (last 12 months) and yours.
  const medianBy = (list: Row[]) => {
    const map = new Map<string, number[]>();
    for (const r of list) map.set(r.key, [...(map.get(r.key) || []), r.amount]);
    return new Map([...map].filter(([, v]) => v.length >= 3).map(([k, v]) => [k, median(v)]));
  };
  const prices: Prices = { others: medianBy(rows.filter((r) => !r.won && daysBefore(r.awardDate, now) <= 365)), yours: medianBy(rows.filter((r) => r.won)) };
  const by = (key: (r: Row) => string) => {
    const map = new Map<string, Row[]>();
    for (const r of rows) { const k = key(r) || "Unknown"; map.set(k, [...(map.get(k) || []), r]); }
    return [...map].map(([name, list]) => group(name, list, prices, now)).sort((a, b) => b.invitations - a.invitations);
  };
  const last90 = rows.filter((r) => daysBefore(r.awardDate, now) <= 90);
  const overall = group("All", rows, prices, now);
  const byTrade = by((r) => r.trade);
  const byBoro = by((r) => r.boro || "");
  const byArea = by((r) => (r.area ? `${r.area} (${r.boro || ""})` : "")).filter((g) => g.invitations >= 8);
  // Where to change price: kind of work in an area, so the advice is specific ("Doors & locks in Bronx").
  const byTradeBoro = by((r) => `${r.trade} · ${r.boro || "?"}`).filter((g) => g.advice === "raise" || g.advice === "lower");
  const losses = rows.filter((r) => !r.won).sort((a, b) => b.awardDate.localeCompare(a.awardDate)).slice(0, 30)
    .map((r) => ({ omo: r.omo, address: r.address || "", area: r.area || r.boro || "", trade: r.trade, amount: r.amount, awardDate: r.awardDate }));
  return {
    overall,
    last90: { invitations: last90.length, won: last90.filter((r) => r.won).length, winRate: last90.length ? last90.filter((r) => r.won).length / last90.length : 0 },
    byTrade, byBoro, byArea,
    moves: byTradeBoro.sort((a, b) => (b.advice === "raise" ? 1 : 0) - (a.advice === "raise" ? 1 : 0) || b.invitations - a.invitations).slice(0, 8),
    losses,
  };
}
