// 📊 Friday wrap (plan item 23): the week in a few words, Friday from 5 PM.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { weekWrap, isFridayWrapTime } = await loadLib("friday-wrap");
assert.equal(weekWrap({ closed: 4, earned: 3820, won: 2, wonAmount: 1880, first: "Mon 11/09 · 10–11 AM at 84-01 MAIN STREET" }),
  "📊 Your week: 4 jobs closed in the field, $3,820 of work done, 2 bids won ($1,880). First next week: Mon 11/09 · 10–11 AM at 84-01 MAIN STREET.");
assert.equal(weekWrap({ closed: 1, earned: 0, won: 0, wonAmount: 0, first: "" }), "📊 Your week: 1 job closed in the field, no bids won. Nothing booked for next week yet.");
assert.equal(isFridayWrapTime(5, 17 * 60), true);
assert.equal(isFridayWrapTime(5, 16 * 60 + 59), false);
assert.equal(isFridayWrapTime(4, 18 * 60), false);
console.log("PASS Friday wrap: the week in a few words, Friday from 5 PM only");
