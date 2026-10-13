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

const { bidResult, winRate, bidFaxCover, bidsToCheck, faxState, todaySummary, withLog, bidHistory } = await loadLib("bid-records");
{
  const nowT = new Date("2026-10-13T14:00:00Z"); // 10:00 AM New York
  const bids = [
    { omo: "A", address: "a", bidDue: "2026-10-13", bidDueTime: "11:00 AM" },
    { omo: "B", address: "b", bidDue: "2026-10-13", bidDueTime: "11:00 AM" },
    { omo: "C", address: "c", bidDue: "2026-10-13", bidDueTime: "10:30 AM" },
    { omo: "D", address: "d", bidDue: "2026-10-13", bidDueTime: "11:00 AM" },
    { omo: "E", address: "e", bidDue: "2026-10-14", bidDueTime: "11:00 AM" },
  ];
  const recs = {
    A: { omo: "A", status: "confirmed", sentAt: "2026-10-13T13:00:00Z", price: 1 },
    B: { omo: "B", status: "sent", sentAt: "2026-10-13T13:55:00Z", price: 1 },
    C: { omo: "C", status: "saved", price: 1 },
  };
  const t = todaySummary(bids, recs, "2026-10-13", 600, nowT);
  assert.deepEqual([t.total, t.sent, t.confirmed, t.pending, t.failed], [4, 2, 1, 1, 0]);
  assert.deepEqual(t.notSent.map((r) => [r.omo, r.minutesLeft, r.state]), [["C", 30, "saved"], ["D", 60, "not-priced"]], "not sent, soonest first");
  assert.equal(t.allDone, false);
  const logged = withLog(withLog({ omo: "A" }, "Price saved $500.00", "2026-10-13T10:00:00Z"), "Fax sent to HPD at $500.00", "2026-10-13T10:05:00Z");
  assert.deepEqual(bidHistory(logged).map((e) => e.what), ["Price saved $500.00", "Fax sent to HPD at $500.00"]);
  const old = bidHistory({ omo: "X", price: 1987, sentPrice: 1987, savedAt: "2026-10-13T00:51:00Z", sentAt: "2026-10-13T00:51:57Z", status: "confirmed", confirmedAt: "2026-10-13T00:56:00Z", revisions: [{ price: 1180, sentAt: "2026-10-12T22:47:00Z" }] });
  assert.deepEqual(old.map((e) => e.what), ["Fax sent to HPD at $1,180.00", "Price saved $1,987.00", "Revised fax sent to HPD at $1,987.00", "HumbleFax: Successful Transmission"], "history for bids saved before the log");
}
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
