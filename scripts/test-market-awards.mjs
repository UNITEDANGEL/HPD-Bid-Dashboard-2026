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

const { bidResult, winRate, bidFaxCover } = await loadLib("bid-records");
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
