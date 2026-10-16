// Your real win rate, from the bids you faxed (data/private/bid_history.json, scripts/fetch_bid_history.py)
// against what HPD awarded (public/data/market_awards.json).
//  - Private (gitignored): data/private/bid_results.json, every job with your price and the winning price.
//  - Public: public/data/bid_win_stats.json, only totals: win rate, how far above the winner you were, by
//    kind of work, borough and month. No job's price is published (the site is public).
// Your price: the last one you faxed for the job. On jobs you won, HPD's award amount is your price, so it
// replaces the OCR reading. A reading under $150 or more than 8x off the winning price is "check" (left out).
import fs from "node:fs";
import path from "node:path";
import { loadLib } from "./daily-report.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const { readScope, priceHelp, bestPrice, winChance } = await loadLib("bid-price");

const history = read("data/private/bid_history.json").bids;
const awards = new Map(read("public/data/market_awards.json").jobs.map((j) => [j.omo, j]));

const rows = [];
let checked = 0, exact = 0;
for (const [omo, sends] of Object.entries(history)) {
  const last = [...sends].reverse().find((s) => s.price);
  const award = awards.get(omo);
  if (!last || !award || !(award.amount > 0)) continue;
  let price = last.price;
  let check = false;
  if (award.won) {
    checked += 1;
    if (Math.abs(price - award.amount) < 1) exact += 1;
    price = award.amount;
  } else if (price < 150 || price > award.amount * 8 || price * 8 < award.amount) {
    check = true;
  }
  const scope = readScope(award.description || "");
  rows.push({
    omo, won: !!award.won, price, winPrice: award.amount, check, month: (award.awardDate || "").slice(0, 7),
    boro: award.boro || "", work: scope.labels[0] || "general repair", sentAt: new Date(last.sentAt).toISOString().slice(0, 10),
  });
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
function summary(list) {
  const good = list.filter((r) => !r.check);
  const won = good.filter((r) => r.won);
  const lost = good.filter((r) => !r.won);
  const above = lost.map((r) => r.price - r.winPrice).filter((d) => d > 0);
  const abovePct = lost.map((r) => Math.round(((r.price - r.winPrice) / r.winPrice) * 100)).filter((d) => d > 0);
  return {
    bids: good.length, won: won.length, winRate: good.length ? Math.round((won.length / good.length) * 100) : null,
    lostAboveBy: median(above), lostAbovePct: median(abovePct),
    closeLosses: lost.filter((r) => r.price > r.winPrice && r.price <= r.winPrice * 1.1).length, // within 10%: one small cut wins these
    lostBelow: lost.filter((r) => r.price <= r.winPrice).length, // you were lower and still lost (not the lowest responsive, or a later bid)
  };
}
const group = (key, min = 5) => Object.entries(rows.reduce((acc, r) => ((acc[r[key]] ||= []).push(r), acc), {}))
  .map(([k, list]) => ({ [key]: k, ...summary(list) }))
  .filter((g) => g.bids >= min)
  .sort((a, b) => b.bids - a.bids);

// The last 30 days, totals only: invitations HPD awarded that got no bid from you (and what they were
// worth to other contractors), and bids lost on price with the typical gap (lock / latch was ~double).
const last30 = (() => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const awarded = [...awards.values()].filter((j) => j.awardDate >= since && j.amount > 0);
  const notBid = awarded.filter((j) => !history[j.omo]);
  const mine = rows.filter((r) => (awards.get(r.omo)?.awardDate || "") >= since && !r.check);
  const lostHigher = mine.filter((r) => !r.won && r.price > r.winPrice);
  const gaps = lostHigher.map((r) => r.price / r.winPrice - 1).sort((x, y) => x - y);
  const median = (list) => (list.length ? Math.round(list[Math.floor(list.length / 2)] * 100) : null);
  const byWork = Object.entries(lostHigher.reduce((acc, r) => ((acc[r.work] ||= []).push(r.price / r.winPrice - 1), acc), {}))
    .map(([work, g]) => ({ work, lost: g.length, medianGapPct: median(g.sort((x, y) => x - y)) }))
    .filter((g) => g.lost >= 2).sort((x, y) => y.lost - x.lost).slice(0, 5);
  return {
    since, awarded: awarded.length, bid: awarded.length - notBid.length, notBid: notBid.length,
    notBidValue: Math.round(notBid.reduce((sum, j) => sum + j.amount, 0)),
    won: mine.filter((r) => r.won).length, lostHigher: lostHigher.length, medianGapPct: median(gaps),
    lostBelow: mine.filter((r) => !r.won && r.price <= r.winPrice).length, byWork,
  };
})();

// Your price against the app's best price at the time (only awards HPD had made before that job): how often
// each would have won and what it would have brought in. Totals only, by month. Since March 2026 your
// prices were about 20% above the best price, and the best price would have won far more jobs.
const vsBest = (() => {
  const market = [...awards.values()].filter((j) => j.amount > 0).map((j) => ({ id: j.omo, description: j.description || "", amount: j.amount, date: j.awardDate || "" })).sort((a, b) => a.date.localeCompare(b.date));
  const months = {};
  const all = { bids: 0, won: 0, wonAmount: 0, bestWon: 0, bestAmount: 0, over15: 0, ratios: [], chanceYours: [], chanceBest: [] };
  for (const r of rows.filter((x) => !x.check)) {
    const job = awards.get(r.omo);
    const date = job.awardDate || "";
    const h = priceHelp(job.description || "", market.filter((m) => m.date < date), 12, new Date(date));
    if (!h) continue;
    const best = bestPrice(h).price;
    const m = (months[r.month] ||= { month: r.month, bids: 0, won: 0, wonAmount: 0, bestWon: 0, bestAmount: 0, over15: 0, ratios: [], chanceYours: [], chanceBest: [] });
    for (const t of [m, all]) {
      t.bids++;
      if (r.won) { t.won++; t.wonAmount += r.winPrice; }
      if (best < r.winPrice) { t.bestWon++; t.bestAmount += best; }
      if (r.price > best * 1.15) t.over15++;
      t.ratios.push(r.price / best);
      if (h.prices.length >= 5) { t.chanceYours.push(winChance(h, r.price)); t.chanceBest.push(winChance(h, best)); }
    }
  }
  const mid = (xs) => { const s2 = [...xs].sort((a, b) => a - b); return s2.length ? s2[Math.floor(s2.length / 2)] : null; };
  const out = (t) => ({ ...(t.month ? { month: t.month } : {}), bids: t.bids, won: t.won, wonAmount: Math.round(t.wonAmount), bestWon: t.bestWon, bestAmount: Math.round(t.bestAmount),
    abovePct: t.ratios.length ? Math.round((mid(t.ratios) - 1) * 100) : null, over15Pct: t.bids ? Math.round((t.over15 / t.bids) * 100) : null,
    chanceYours: t.chanceYours.length ? Math.round(mid(t.chanceYours) * 100) : null, chanceBest: t.chanceBest.length ? Math.round(mid(t.chanceBest) * 100) : null });
  return { total: out(all), byMonth: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).filter((m) => m.bids >= 5).map(out) };
})();

const stats = {
  generatedAt: new Date().toISOString(),
  note: "From the bids you faxed HPD (price read from each package) against HPD's awards. Totals only.",
  ocrCheck: { wonJobsChecked: checked, exact }, // how often the price read from the PDF matched HPD's award
  total: summary(rows),
  last30,
  vsBest,
  byWork: group("work"),
  byBoro: group("boro"),
  byMonth: group("month", 1).sort((a, b) => a.month.localeCompare(b.month)),
};
fs.mkdirSync(path.join(ROOT, "data", "private"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "private", "bid_results.json"), JSON.stringify({ generatedAt: stats.generatedAt, rows }, null, 1));
fs.writeFileSync(path.join(ROOT, "public", "data", "bid_win_stats.json"), JSON.stringify(stats, null, 1));
console.log(`Vs best price: ${vsBest.total.bids} bids, you won ${vsBest.total.won} ($${vsBest.total.wonAmount}), best price would have won ${vsBest.total.bestWon} ($${vsBest.total.bestAmount}); your prices a median ${vsBest.total.abovePct}% above best`);
console.log(`Bid results: ${rows.length} bids with an award (${rows.filter((r) => r.check).length} to check), won ${stats.total.won} (${stats.total.winRate}%); lost by a median $${stats.total.lostAboveBy} (${stats.total.lostAbovePct}%); ${stats.total.closeLosses} lost within 10%; price read matched the award on ${exact} of ${checked} wins`);
