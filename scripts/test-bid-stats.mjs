// Bid stats from awards whose numbers can be checked by hand: your price list against the market,
// "should have bid" (jobs others won above your usual price), and the Easy win flag.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { bidStats, easyWin, beats, historyRows, filterHistory } = await loadLib("bid-stats");
const now = new Date("2026-10-12T12:00:00Z");
const day = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
const LOCK = "INSTALL NEW PASSAGE LOCK AT COMPACTOR DOOR. TOTAL DOORS = (1)";
const LEAK = "TRACE AND REPAIR LEAK. REPLACE SHEETROCK APPROX 30 SQ FT. PAINT CEILING APPROX 30 SQ FT.";
let n = 0;
const job = (description, amount, won, ago, extra = {}) => ({ omo: `ER${String(++n).padStart(5, "0")}`, description, amount, won, awardDate: day(ago), boro: "Bronx", area: "Fordham", address: `${n} MAIN ST`, ...extra });
const jobs = [
  // You win one-door passage locks at $400 (5 wins)...
  ...[390, 400, 400, 410, 420].map((a, i) => job(LOCK, a, true, 30 + i * 20)),
  // ...other contractors win them at $600 typically (6 jobs in 12 months; one older one ignored).
  ...[560, 580, 600, 600, 640, 700].map((a, i) => job(LOCK, a, false, 10 + i * 15)),
  job(LOCK, 300, false, 500),
  // Leak jobs: you only won 2, not enough for a usual price.
  job(LEAK, 1800, true, 40), job(LEAK, 1900, true, 60),
  ...[1700, 1750, 1800, 1850, 1900].map((a, i) => job(LEAK, a, false, 20 + i * 10)),
];
const s = bidStats(jobs, now);

const lock = s.priceList.find((p) => p.label === "lock / latch");
assert.ok(lock, "passage lock is on the price list");
assert.deepEqual([lock.yours, lock.yoursN, lock.others, lock.othersN], [400, 5, 600, 6], "your usual $400 from 5 wins, winners $600 from 6 jobs in 12 months");
assert.equal(lock.suggested, 540, "10% under $600");
assert.deepEqual(beats(lock, 540), { n: 6, of: 6, share: 1 }, "$540 is under all 6 winning prices");
assert.deepEqual(beats(lock, 600), { n: 2, of: 6, share: 2 / 6 }, "$600 ties two and is under two");
assert.ok(!s.priceList.some((p) => /leak/.test(p.label)), "2 wins is not enough for a usual price");

// Should have bid: other contractors' lock jobs in the last 90 days, all above your usual $400.
const recentOthers = jobs.filter((j) => !j.won && j.description === LOCK && (now - Date.parse(j.awardDate)) / 86400000 <= 90);
assert.equal(s.shouldHaveBid.length, recentOthers.length);
assert.equal(s.shouldHaveBidTotal, 400 * recentOthers.length, "valued at your usual price");
assert.deepEqual(Object.keys(s.shouldHaveBid[0]).sort(), ["address", "amount", "area", "awardDate", "omo", "work", "yours", "yoursN"]);
assert.ok(s.shouldHaveBid.every((j) => j.amount > j.yours && j.work === "lock / latch"));

// Easy win: a new lock invitation; not for work with too little history.
const e = easyWin("AT PUBLIC HALL: INSTALL NEW PASSAGE LOCK. TOTAL DOORS = (1)", s.workPrices);
assert.deepEqual([e.suggested, e.yours, e.others, e.beatsN, e.of], [540, 400, 600, 6, 6]);
assert.equal(easyWin(LEAK, s.workPrices), null);
assert.equal(easyWin("REPAIR FIRE ESCAPE DROP LADDER", s.workPrices), null);

// History: search and filters.
const rows = historyRows(jobs);
assert.equal(rows.length, jobs.length);
const all = filterHistory(rows, { text: "", trade: "", boro: "", who: "all" });
assert.deepEqual([all.count, all.yours], [jobs.length, jobs.filter((j) => j.won).length]);
const lockOthers = filterHistory(rows, { text: "passage lock", trade: "", boro: "", who: "others" });
assert.equal(lockOthers.count, 7, "6 recent + 1 older lock job won by others");
assert.equal(lockOthers.median, 600);
assert.equal(filterHistory(rows, { text: "ER00001", trade: "", boro: "", who: "all" }).count, 1);
assert.equal(filterHistory(rows, { text: "", trade: "", boro: "Queens", who: "all" }).count, 0);
console.log("PASS bid stats: price list (your usual vs winners, suggested, beats N of M), should-have-bid from real awards, Easy win only with enough history, history search and filters");
