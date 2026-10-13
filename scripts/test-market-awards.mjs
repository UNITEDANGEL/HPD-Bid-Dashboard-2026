// Market awards: tonight's invitations keep their descriptions, awards from NYC Open Data are joined by
// OMO (yours marked won), and a lost bid shows the price that won it. No network: data is inline.
import assert from "node:assert/strict";
import { addUpcoming, joinAwards } from "./update-market-awards.mjs";
import { loadLib } from "./daily-report.mjs";

const descriptions = { ER00001: { description: "REPLACE CRACKED GLASS AT WINDOW. APPROX 6 SQ FT" } };
assert.equal(addUpcoming(descriptions, { bids: [{ omo: "ER00002", description: "INSTALL NEW DOOR CLOSER", itbFile: "ER00002_1.pdf" }, { omo: "ER00001", description: "other" }] }), 1);
assert.equal(descriptions.ER00001.description, "REPLACE CRACKED GLASS AT WINDOW. APPROX 6 SQ FT", "a kept description is not replaced");
const jobs = joinAwards({ ...descriptions, ER00003: { description: "AEP TRACE LEAK" } }, [
  { omonumber: "ER00001", omoawardamount: "455", omoawarddate: "2026-10-01T00:00:00.000", boro: "Queens", isaep: "False" },
  { omonumber: "ER00002", omoawardamount: "520", omoawarddate: "2026-10-05T00:00:00.000", boro: "Bronx", isaep: "False" },
  { omonumber: "ER00003", omoawardamount: "0", omoawarddate: "" },
  { omonumber: "ER09999", omoawardamount: "800", omoawarddate: "2026-10-05T00:00:00.000" },
], new Set(["ER00002"]));
assert.deepEqual(jobs.map((j) => [j.omo, j.amount, j.awardDate, j.won]), [["ER00002", 520, "2026-10-05", true], ["ER00001", 455, "2026-10-01", false]]);

const { bidResult, winRate, bidFaxCover, bidsToCheck, faxState } = await loadLib("bid-records");
// The copy with the later fax wins, even if an old copy was touched more recently.
const { mergeServerBids } = await loadLib("bid-records");
const oldCopy = { omo: "ER05994", price: 1180, sentPrice: 1180, status: "confirmed", sentAt: "2026-10-12T22:47:39Z", updatedAt: "2026-10-13T02:00:00Z" };
const revision = { omo: "ER05994", price: 1987, sentPrice: 1987, status: "sent", sentAt: "2026-10-13T00:51:57Z", updatedAt: "2026-10-13T00:51:58Z" };
assert.equal(mergeServerBids({ ER05994: oldCopy }, { "BID-ER05994": revision }).ER05994.price, 1987, "the iPhone's revision beats an old copy confirmed later");
assert.equal(mergeServerBids({ ER05994: revision }, { "BID-ER05994": oldCopy }).ER05994.price, 1987);
const draft = { ...revision, price: 2100, updatedAt: "2026-10-13T01:10:00Z" };
assert.equal(mergeServerBids({ ER05994: revision }, { "BID-ER05994": draft }).ER05994.price, 2100, "same fax: the later update wins");
const nowCheck = new Date("2026-10-13T01:00:00Z");
const toCheck = bidsToCheck({
  A: { omo: "A", status: "sent", sentAt: "2026-10-13T00:51:57Z" },
  B: { omo: "B", status: "confirmed", sentAt: "2026-10-13T00:40:00Z" },
  C: { omo: "C", status: "sent", sentAt: "2026-10-10T00:00:00Z" },
  D: { omo: "D", status: "saved" },
}, nowCheck);
assert.deepEqual(toCheck.map((r) => r.omo), ["A"], "only sent bids from the last 2 days are checked");
assert.equal(faxState({ status: "sent", sentAt: "2026-10-13T00:50:00Z" }, nowCheck), "waiting", "10 minutes: still waiting");
assert.equal(faxState({ status: "sent", sentAt: "2026-10-13T00:40:00Z" }, nowCheck), "unconfirmed", "20 minutes with no email: not confirmed yet");
const revised = bidFaxCover({ omo: "ER05994", address: "1987 ADAM C POWELL BOULEVARD", borough: "MN" }, 1100, 1250);
assert.match(revised.subject, /^REVISED Bid - OMO ER05994 - /);
assert.match(revised.text, /REVISED BID for OMO ER05994[\s\S]*Please disregard our previous bid of \$1,250\.00\.\nOur new bid price is \$1,100\.00\./);
assert.match(bidFaxCover({ omo: "ER1", address: "A" }, 900).text, /Bid price: \$900\.00/);
const rec = { omo: "ER00001", bidDue: "2026-09-29", price: 500, sentPrice: 500, status: "confirmed" };
const market = new Map([["ER00001", 455]]);
assert.deepEqual(bidResult(rec, new Map(), "2026-10-02", market), { result: "lost", winningPrice: 455 });
assert.equal(bidResult(rec, new Map([["ER00001", 500]]), "2026-10-02", market).result, "won", "your award wins over the open data");
assert.equal(bidResult(rec, new Map(), "2026-10-02").result, "pending", "no award posted yet: pending");
assert.deepEqual(winRate([rec], new Map(), "2026-10-02", market), { sent: 1, decided: 1, won: 0, percent: 0 });
console.log("PASS market awards: descriptions kept, awards joined by OMO (yours marked), lost bids show the winning price");
