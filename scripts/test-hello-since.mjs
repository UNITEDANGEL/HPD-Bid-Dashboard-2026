// 📋 A message board, not repeats (owner, 6 Nov).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { helloSince } = await loadLib("said-today");
const day = "2026-11-06";
const r1 = { done: ["bids sent"], reminded: [{ text: "ER01720 notice", done: false }], coming: [] };
const first = helloSince("Jot", r1, "go to ER07610", null, day, Date.parse("2026-11-06T13:00:00-05:00"));
assert.match(first.text, /^Hi again, Jot\./, "the first time today: the usual");
const same = helloSince("Jot", r1, "go to ER07610", first.snap, day, Date.parse("2026-11-06T14:00:00-05:00"));
assert.equal(same.text, "Hi again, Jot. Nothing new since 1:00 PM. Same next step, it's on the board.");
const r2 = { done: ["bids sent", "ER07610 visited"], reminded: [{ text: "ER01720 notice", done: false }, { text: "EP04029 documents", done: false }], coming: [] };
const moved = helloSince("Jot", r2, "go to EQ31220", same.snap, day, Date.parse("2026-11-06T15:00:00-05:00"));
assert.equal(moved.text, "Hi again, Jot. Since we talked: ER07610 visited done. New: EP04029 documents. Next: go to EQ31220.");
assert.ok(!/bids sent|ER01720/.test(moved.text), "what was already said isn't said again");
console.log("PASS message board: hi again says only what changed since last time; nothing new = one short line");
