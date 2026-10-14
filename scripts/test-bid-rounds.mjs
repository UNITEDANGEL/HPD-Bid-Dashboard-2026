// HPD invites the same OMO again for a new price (new due date): a new round that starts fresh, shows what
// you bid before; a duplicate invitation for the same due date is the same bid.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const { currentRecord, earlierRounds } = await loadLib("bid-records");

const sent = { omo: "ER05994", address: "1987 ADAM C POWELL BOULEVARD", bidDue: "2026-10-13", price: 2000, savedAt: "2026-10-12T14:00:00Z", status: "confirmed", sentAt: "2026-10-12T14:05:00Z", sentPrice: 2000, attempts: 1, updatedAt: "2026-10-12T14:05:00Z" };
const records = { ER05994: sent };

// Same OMO, same due date (a duplicate invitation): the same bid, still locked as sent.
assert.equal(currentRecord({ omo: "ER05994", bidDue: "2026-10-13" }, records), sent);
assert.deepEqual(earlierRounds({ omo: "ER05994", bidDue: "2026-10-13" }, records), []);

// Invited again for 10/15: a fresh round; the earlier round shows what you sent.
const again = { omo: "ER05994", bidDue: "2026-10-15" };
assert.equal(currentRecord(again, records), undefined, "a new round isn't locked by the earlier fax");
assert.deepEqual(earlierRounds(again, records), [{ bidDue: "2026-10-13", price: 2000, sentAt: "2026-10-12T14:05:00Z", status: "confirmed" }]);

// After saving the new round, it is current and keeps the earlier one.
const round2 = { ...sent, bidDue: "2026-10-15", price: 2100, status: "saved", sentAt: undefined, sentPrice: undefined, rounds: [{ bidDue: "2026-10-13", price: 2000, sentAt: "2026-10-12T14:05:00Z", status: "confirmed" }] };
assert.equal(currentRecord(again, { ER05994: round2 }), round2);
assert.deepEqual(earlierRounds(again, { ER05994: round2 }).map((r) => r.price), [2000]);

// A price saved but never sent for an earlier date is still this bid (nothing went to HPD).
const unsent = { ...sent, status: "saved", sentAt: undefined, sentPrice: undefined };
assert.equal(currentRecord(again, { ER05994: unsent }), unsent);
console.log("PASS bid rounds: same OMO invited again = new round with the earlier price shown; same-day duplicate = same bid");
