// 🗣 Say it once (owner, 5 Nov: "greeting in the morning once... don't keep reminding me... these are the things I
// reminded you, these are completed... no repetitive"). The brief is said once a day, a reminder once, and coming back
// gives "Hi again" with what got done and what's still open, never the counts again.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { readDayLog, briefDone, markBrief, noteSaid, wasSaid, dayRecap, helloAgain } = await loadLib("said-today");
const { parseCommand } = await loadLib("voice-agent");

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const s = mem();
const D = "2026-11-05";
assert.equal(briefDone(D, s), false);
markBrief(D, s, 1000);
assert.equal(briefDone(D, s), true, "the brief is remembered");
markBrief(D, s, 5000);
assert.equal(readDayLog(D, s).briefAt, 1000, "said once: the first time stays");
assert.equal(briefDone("2026-11-06", s), false, "a new day gets a new morning");

assert.equal(noteSaid(D, "bids:2026-11-05", "16 bids due today", s), true);
assert.equal(noteSaid(D, "bids:2026-11-05", "16 bids due today", s), false, "the same reminder isn't said twice");
assert.equal(noteSaid(D, "notice:ER03009", "notice ER03009 overdue", s), true);
assert.equal(wasSaid(D, "notice:ER03009", s), true);
assert.equal(wasSaid("2026-11-06", "notice:ER03009", s), false);

// Bids all sent (key no longer open); the notice still open.
const r = dayRecap(readDayLog(D, s), ["🧾 16 bids sent"], new Set(["notice:ER03009"]), ["🧾 4 bids due tomorrow"]);
assert.deepEqual(r.reminded, [{ text: "16 bids due today", done: true }, { text: "notice ER03009 overdue", done: false }]);
const hi = helloAgain("Jot", r, "notice ER03009 overdue 20 hours.");
assert.equal(hi, "Hi again, Jot. Done today: 🧾 16 bids sent. Still open from what I told you: notice ER03009 overdue. Next: notice ER03009 overdue 20 hours.");
assert.doesNotMatch(hi, /Good morning|jobs? to do/);
assert.equal(helloAgain("Jot", dayRecap(readDayLog(D, s), [], new Set(), []), ""), "Hi again, Jot. 2 of the things I told you this morning are done. What's next?");

// The words.
for (const t of ["what did we do today", "what did I do today", "what have we done so far", "what's done today", "recap", "today so far", "what did you remind me", "what did you remind me about today", "what's left to do", "what's coming up this week", "what work is left", "future work"]) assert.deepEqual(parseCommand(t), { intent: "recap" }, t);
assert.equal(parseCommand("what do I have today").intent, "today");
assert.equal(parseCommand("what did I miss").intent, "catch-up");
console.log("PASS said once: the morning brief once a day, a reminder once, 'Hi again' with done / still open / next (no counts), what did we do today / what's left / what did you remind me");
