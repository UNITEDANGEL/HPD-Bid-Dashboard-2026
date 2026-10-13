// Bid stats: every invitation you received that HPD awarded, yours or another contractor's, with the
// price it was won at (NYC Open Data). Grouped by kind of work and by area, it shows where you win, what
// winners charge, and where your price is too low (money left on the table) or too high (jobs lost).
// For jobs you won, the award is your bid. For jobs you lost, your own bid is known only for bids sent
// from this app; the winning price is known for all of them.
import { readScope } from "./bid-price";

export type MarketJob = { omo: string; amount: number; awardDate: string; won: boolean; boro?: string; zip?: string; area?: string; address?: string; description: string };

const TRADES: [name: string, items: string[]][] = [
  ["Doors & locks", ["door-new", "closer", "lock", "entrance-lock", "hinges", "pushbar", "door-adjust"]],
  ["Windows & glass", ["glass", "window-hardware", "window-new"]],
  ["Leaks, plaster & paint", ["leak", "sheetrock", "paint", "ceiling", "wall", "mold"]],
  ["Floors & tile", ["floor"]],
  ["Plumbing", ["plumbing"]],
  ["Electrical & detectors", ["electric", "detector", "intercom"]],
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
export function workKey(description: string) {
  return workOf(description).key;
}

const SIZE_LABEL: Record<string, string> = { "1 unit": "", "2-3 units": "2-3 doors/windows", "4+ units": "4+ doors/windows", "<50 sqft": "under 50 sq ft", "50-200 sqft": "50-200 sq ft", "200+ sqft": "200+ sq ft" };

function workOf(description: string) {
  const s = readScope(description);
  const units = s.doors + s.windows;
  const size = units >= 4 ? "4+ units" : units >= 2 ? "2-3 units" : s.sqft >= 200 ? "200+ sqft" : s.sqft >= 50 ? "50-200 sqft" : s.sqft > 0 ? "<50 sqft" : "1 unit";
  const order = s.items.map((k, i) => [k, s.labels[i]] as const).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    key: `${order.map(([k]) => k).join("+") || "other"} | ${size}`,
    label: [order.map(([, l]) => l).join(" + ") || "general repair", SIZE_LABEL[size]].filter(Boolean).join(" · "),
  };
}

type Row = MarketJob & { trade: string; key: string; label: string };

// One kind of work at one size, from real awards: your wins (all) and other contractors' wins in the
// last 12 months. A price "beats" a past winner when it is under what that job was won for.
export type WorkPrice = {
  key: string; label: string;
  yours: number; yoursN: number;          // your typical winning price, from this many of your wins
  others: number; othersN: number;        // other winners' typical price, last 12 months, this many jobs
  othersAmounts: number[];                // those winning prices, for "beats N of M"
  suggested: number;                      // 10% under the typical winner, never below your usual
};

export function beats(price: WorkPrice, bid: number) {
  const n = price.othersAmounts.filter((a) => a > bid).length;
  return { n, of: price.othersAmounts.length, share: price.othersAmounts.length ? n / price.othersAmounts.length : 0 };
}

const round5 = (v: number) => Math.round(v / 5) * 5;

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
  const rows: Row[] = jobs.filter((j) => j.amount > 0 && j.awardDate).map((j) => ({ ...j, trade: tradeOf(j.description), ...workOf(j.description) }));
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
  // Your price list against the market: every kind of work with 3+ of your wins and 5+ other winners
  // in the last 12 months.
  const workPrices = new Map<string, WorkPrice>();
  const grouped = new Map<string, { label: string; mine: number[]; others: number[] }>();
  for (const r of rows) {
    const g = grouped.get(r.key) || { label: r.label, mine: [], others: [] };
    if (r.won) g.mine.push(r.amount);
    else if (daysBefore(r.awardDate, now) <= 365) g.others.push(r.amount);
    grouped.set(r.key, g);
  }
  for (const [key, g] of grouped) {
    if (g.mine.length < 3 || g.others.length < 5) continue;
    const yours = Math.round(median(g.mine)), others = Math.round(median(g.others));
    workPrices.set(key, { key, label: g.label, yours, yoursN: g.mine.length, others, othersN: g.others.length, othersAmounts: g.others, suggested: Math.max(yours, round5(others * 0.9)) });
  }
  const priceList = [...workPrices.values()].sort((a, b) => b.othersN + b.yoursN - (a.othersN + a.yoursN));

  // Should have bid: jobs awarded to someone else in the last 90 days for MORE than your usual price
  // for that exact work. Each one is a real award (OMO, address, date, amount).
  const shouldHaveBid = rows
    .filter((r) => !r.won && daysBefore(r.awardDate, now) <= 90)
    .map((r) => ({ r, p: workPrices.get(r.key) || (grouped.get(r.key)?.mine.length || 0) >= 3 ? { yours: Math.round(median(grouped.get(r.key)!.mine)), yoursN: grouped.get(r.key)!.mine.length } : null }))
    .filter((x): x is { r: Row; p: { yours: number; yoursN: number } } => !!x.p && x.p.yours < x.r.amount * 0.97)
    .sort((a, b) => b.r.awardDate.localeCompare(a.r.awardDate) || b.r.amount - a.r.amount)
    .map(({ r, p }) => ({ omo: r.omo, awardDate: r.awardDate, address: r.address || "", area: r.area || r.boro || "", work: r.label, amount: r.amount, yours: p.yours, yoursN: p.yoursN }));

  // Win rate month by month (by award month), newest first.
  const monthMap = new Map<string, { month: string; invitations: number; won: number; moneyWon: number; moneyAll: number }>();
  for (const r of rows) {
    const k = r.awardDate.slice(0, 7);
    const m = monthMap.get(k) || { month: k, invitations: 0, won: 0, moneyWon: 0, moneyAll: 0 };
    m.invitations++; m.moneyAll += r.amount;
    if (r.won) { m.won++; m.moneyWon += r.amount; }
    monthMap.set(k, m);
  }
  const byMonth = [...monthMap.values()].filter((m) => m.invitations >= 5).sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => ({ ...m, winRate: m.won / m.invitations, moneyWon: Math.round(m.moneyWon), moneyAll: Math.round(m.moneyAll) }));

  const losses = rows.filter((r) => !r.won).sort((a, b) => b.awardDate.localeCompare(a.awardDate)).slice(0, 30)
    .map((r) => ({ omo: r.omo, address: r.address || "", area: r.area || r.boro || "", trade: r.trade, amount: r.amount, awardDate: r.awardDate }));
  return {
    overall,
    last90: { invitations: last90.length, won: last90.filter((r) => r.won).length, winRate: last90.length ? last90.filter((r) => r.won).length / last90.length : 0 },
    byTrade, byBoro, byArea,
    moves: byTradeBoro.sort((a, b) => (b.advice === "raise" ? 1 : 0) - (a.advice === "raise" ? 1 : 0) || b.invitations - a.invitations).slice(0, 8),
    losses,
    byMonth,
    priceList,
    workPrices,
    shouldHaveBid,
    shouldHaveBidTotal: shouldHaveBid.reduce((sum, j) => sum + j.yours, 0),
  };
}

// An open invitation that is work you win at a price well under what other winners get: bid it.
export function easyWin(description: string, workPrices: Map<string, WorkPrice>) {
  const price = workPrices.get(workKey(description));
  if (!price || price.yoursN < 5 || price.yours > price.others * 0.9) return null;
  const b = beats(price, price.suggested);
  return b.share >= 0.6 ? { ...price, beatsN: b.n, of: b.of } : null;
}

// Job history: every awarded invitation with what it was won for, searchable and filterable.
export type HistoryRow = MarketJob & { trade: string; summary: string; search: string };
export type HistoryFilter = { text: string; trade: string; boro: string; who: "all" | "you" | "others" };

export function historyRows(jobs: MarketJob[]): HistoryRow[] {
  return jobs.filter((j) => j.amount > 0 && j.awardDate).map((j) => {
    const summary = readScope(j.description).summary;
    return { ...j, trade: tradeOf(j.description), summary, search: [j.omo, j.address, j.area, j.boro, j.zip, summary, j.description].join(" ").toLowerCase() };
  }).sort((a, b) => b.awardDate.localeCompare(a.awardDate) || a.omo.localeCompare(b.omo));
}

export function filterHistory(rows: HistoryRow[], f: HistoryFilter) {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  const list = rows.filter((r) =>
    (!f.trade || r.trade === f.trade) && (!f.boro || r.boro === f.boro) &&
    (f.who === "all" || (f.who === "you") === r.won) && words.every((w) => r.search.includes(w)));
  const mine = list.filter((r) => r.won), others = list.filter((r) => !r.won);
  return {
    rows: list, count: list.length, yours: mine.length,
    total: Math.round(list.reduce((s, r) => s + r.amount, 0)),
    median: Math.round(median(list.map((r) => r.amount))),
    yoursMedian: Math.round(median(mine.map((r) => r.amount))),
    othersMedian: Math.round(median(others.map((r) => r.amount))),
  };
}

// Price history of one kind of work, month by month: typical winning price for you and for other
// contractors, with how many jobs each month, plus the jobs themselves (newest first).
export type MonthPoint = { month: string; yours: number | null; yoursN: number; others: number | null; othersN: number };

export function workHistory(jobs: MarketJob[], key: string, now = new Date(), months = 18) {
  const rows = jobs.filter((j) => j.amount > 0 && j.awardDate && workKey(j.description) === key);
  const list: MonthPoint[] = [];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    const month = d.toISOString().slice(0, 7);
    const inMonth = rows.filter((r) => r.awardDate.slice(0, 7) === month);
    const mine = inMonth.filter((r) => r.won).map((r) => r.amount), others = inMonth.filter((r) => !r.won).map((r) => r.amount);
    list.push({ month, yours: mine.length ? Math.round(median(mine)) : null, yoursN: mine.length, others: others.length ? Math.round(median(others)) : null, othersN: others.length });
  }
  const first = list.findIndex((m) => m.yoursN || m.othersN);
  return {
    months: first < 0 ? [] : list.slice(first),
    jobs: rows.sort((a, b) => b.awardDate.localeCompare(a.awardDate)).map((r) => ({ omo: r.omo, amount: r.amount, awardDate: r.awardDate, won: r.won, address: r.address || "", area: r.area || r.boro || "" })),
  };
}

// Your own prices, learned from the bids you saved or sent: by kind of work (same work, same size),
// newest first. The next invitation of that kind starts from your price.
export type MyPrice = { omo: string; price: number; date: string; sent: boolean; reason?: string; label: string };
export function myPrices(
  records: { omo: string; price: number; sentPrice?: number; status: string; sentAt?: string; savedAt?: string; updatedAt?: string; reason?: string }[],
  descriptionOf: (omo: string) => string | undefined,
) {
  const out = new Map<string, MyPrice[]>();
  for (const r of records) {
    const description = descriptionOf(r.omo);
    if (!description || !(r.price > 0)) continue;
    const { key, label } = workOf(description);
    const sent = r.status !== "saved";
    // A sent bid's price is what HPD has; a newer saved-but-unsent price is still your latest thinking.
    const price = r.price;
    const date = String(r.updatedAt || r.sentAt || r.savedAt || "");
    out.set(key, [...(out.get(key) || []), { omo: r.omo, price, date, sent, reason: r.reason, label }]);
  }
  for (const list of out.values()) list.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}
