// One fax for several bids (owner, 31 Oct "do 4"): the cover names every OMO (HPD once missed ER06823 inside a fax
// titled with another job's OMO) and each bid's own package goes along, in order; 2 to 6 bids; which checklist bids can
// go (saved, not sent, before the deadline, soonest first). The fax endpoint is faked: nothing is sent.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { batchFaxCover, sendBatchBidFax, MAX_BATCH } = await loadLib("bid-records");
const { batchCandidates } = await loadLib("bid-checklist");

const bids = [
  { omo: "ER07409", address: "12 MAIN STREET", borough: "Bronx", price: 1450 },
  { omo: "ER09999", address: "40 PARK PLACE", borough: "Brooklyn", price: 980 },
];
const cover = batchFaxCover(bids);
assert.equal(cover.subject, "2 BIDS - OMO ER07409, ER09999 - United Angel Construction Corp.");
assert.match(cover.text, /^2 SEPARATE BIDS IN THIS FAX\. Please log each one under its own OMO:/);
assert.match(cover.text, /1\. OMO ER07409 · 12 MAIN STREET, Bronx · Bid price \$1,450\.00/);
assert.match(cover.text, /2\. OMO ER09999 · 40 PARK PLACE, Brooklyn · Bid price \$980\.00/);
assert.match(batchFaxCover([{ ...bids[0], previousPrice: 1600 }, bids[1]]).text, /REVISED BID \$1,450\.00 \(please disregard our previous bid of \$1,600\.00\)/);

// Sending: one request to the bid fax endpoint, both PDFs attached, the subject naming both.
const calls = [];
const fetcher = async (url, options) => { calls.push({ url, options }); return Response.json({ sent: true, to: "2128638655@humblefax.com", messageId: "m1", sentAt: "2026-10-31T14:00:00Z" }); };
const pdf = (t) => new TextEncoder().encode(`%PDF-1.4 ${t}`);
const result = await sendBatchBidFax(bids.map((b) => ({ ...b, pdf: pdf(b.omo), fileName: `${b.omo}_BID.pdf` })), fetcher);
assert.equal(result.ok, true);
assert.equal(calls.length, 1, "one fax");
assert.equal(calls[0].url, "/api/drive/fax-bid");
assert.equal(decodeURIComponent(calls[0].options.headers["X-HPD-Subject"]), cover.subject);
assert.equal(calls[0].options.headers["X-HPD-Fax-Line"], "main");
const body = String(calls[0].options.body);
assert.ok(body.indexOf("ER07409_BID.pdf") > 0 && body.indexOf("ER09999_BID.pdf") > body.indexOf("ER07409_BID.pdf"), "both packages, in order");
const textPart = body.split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
assert.equal(Buffer.from(textPart, "base64").toString("utf8"), cover.text, "the cover text is the fax's first page");
// 1 bid, or more than 6: not sent.
assert.equal((await sendBatchBidFax([{ ...bids[0], pdf: pdf("x"), fileName: "x.pdf" }], fetcher)).ok, false);
assert.equal((await sendBatchBidFax(Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ ...bids[0], omo: `ER0000${i}`, pdf: pdf("x"), fileName: "x.pdf" })), fetcher)).ok, false);
assert.equal(calls.length, 1, "nothing more was sent");

// Which checklist rows can go together.
const row = (omo, state, minutesLeft) => ({ omo, state, minutesLeft, address: "", borough: "", day: "today", bidDueTime: "11:00 AM", best: null, chance: null, easy: false });
assert.deepEqual(batchCandidates([row("A", "saved", 300), row("B", "not-priced", 100), row("C", "saved", 90), row("D", "pending", 50), row("E", "saved", -5), row("F", "failed", 60)]).map((r) => r.omo), ["C", "A"]);
console.log("PASS one fax for several bids: cover names every OMO and price (revised too), one request with each package in order, 2-6 bids only, saved unsent bids before the deadline");
