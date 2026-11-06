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
assert.deepEqual(r.reminded, [{ text: "16 bids due today", done: true, key: "bids:2026-11-05" }, { text: "notice ER03009 overdue", done: false, key: "notice:ER03009" }]);
const hi = helloAgain("Jot", r, "notice ER03009 overdue 20 hours.");
assert.equal(hi, "Hi again, Jot. Done today: 🧾 16 bids sent. Still open from what I told you: notice ER03009 overdue. Next: notice ER03009 overdue 20 hours.");
assert.doesNotMatch(hi, /Good morning|jobs? to do/);
assert.equal(helloAgain("Jot", dayRecap(readDayLog(D, s), [], new Set(), []), ""), "Hi again, Jot. 2 of the things I told you this morning are done. What's next?");

// The words.
for (const t of ["what did we do today", "what did I do today", "what have we done so far", "what's done today", "recap", "today so far", "what did you remind me", "what did you remind me about today", "what's left to do", "what work is left", "future work"]) assert.deepEqual(parseCommand(t), { intent: "recap" }, t);
assert.equal(parseCommand("what do I have today").intent, "today");
assert.equal(parseCommand("what did I miss").intent, "catch-up");
console.log("PASS said once: the morning brief once a day, a reminder once, 'Hi again' with done / still open / next (no counts), what did we do today / what's left / what did you remind me");

// ➡️ The next part, a yes, "it", and short speech (owner, 5 Nov: "the agent needs to be more real").
{
  const { nextPart, isYes, refersBack, shortSpeech } = await loadLib("said-today");
  assert.deepEqual(nextPart("bids", { bidsLeft: 0, noticesToSend: 2, nextStep: "Call the tenant" }), { part: "notices", text: "Today's bids are done. Notices next: 2 to send. Go?" });
  assert.deepEqual(nextPart("bids", { bidsLeft: 0, noticesToSend: 0, nextStep: "Call the tenant." }), { part: "jobs", text: "Today's bids are done. Your jobs next: Call the tenant. Go?" });
  assert.deepEqual(nextPart("notices", { bidsLeft: 3, noticesToSend: 0, nextStep: "" }), { part: "bids", text: "The notices are done. Bids next: 3 left today. Go?" });
  assert.equal(nextPart("notices", { bidsLeft: 0, noticesToSend: 0, nextStep: "" }).part, "");
  for (const t of ["go", "yes", "OK", "okay let's go", "do it", "yes please", "sure", "let's go!"]) assert.equal(isYes(t), true, t);
  for (const t of ["go to ER00272", "yes the tenant refused", "no", "ok what's next"]) assert.equal(isYes(t), false, t);
  assert.equal(refersBack("I already sent it"), true);
  assert.equal(refersBack("read me that one"), true);
  assert.equal(refersBack("I already sent ER00272"), false);
  const long = "One thing is first. Two is the second thing here. Three costs $1,200.00 today. Four is more. Five is more words to make this long enough to cut down for speech, really quite long indeed, more than three hundred characters in all, so it is cut and the rest stays on the screen for you, with every detail written out in full for you to read whenever you like, at your own pace.";
  assert.equal(shortSpeech(long), "One thing is first. Two is the second thing here. The rest is on the screen.");
  assert.equal(shortSpeech("Short. Answer."), "Short. Answer.");
  console.log("PASS more real: next part after bids / notices (Go?), a short yes does it, 'it' = the job just talked about, long answers cut out loud");
}

// 🗓 Plan my week, ✅ do all, 🔁 one greeting across phones (owner, 5 Nov: "do all ... stick to the plan").
{
  const { planWeek, weekSpeech } = await loadLib("week-plan");
  // Thursday 5 Nov 2026.
  const p = planWeek("2026-11-05", [
    { icon: "📄", day: "2026-11-03", text: "answer notice ER01720" },
    { icon: "🧾", day: "2026-11-05", text: "3 bids to send" },
    { icon: "📅", day: "2026-11-09", text: "10 AM at 12 Main St" },
    { icon: "🧾", day: "2026-11-20", text: "2 bids to send" },
    { icon: "🗂", flex: true, text: "close out A" }, { icon: "🗂", flex: true, text: "close out B" }, { icon: "🗂", flex: true, text: "close out C" },
  ]);
  assert.equal(p.days.length, 7);
  assert.deepEqual(p.days.map((d) => d.label).slice(0, 3), ["Today", "Tomorrow", "Sat 11/7"]);
  assert.deepEqual(p.days[0].items.map((x) => x.text), ["answer notice ER01720", "3 bids to send", "close out A"], "late on today; close-outs fill to 3 a day");
  assert.equal(p.days[0].items[0].late, true);
  assert.deepEqual(p.days[1].items.map((x) => x.text), ["close out B", "close out C"]);
  assert.equal(p.days[2].items.length + p.days[3].items.length, 0, "no close-outs on the weekend");
  assert.deepEqual(p.days[4].items.map((x) => x.text), ["10 AM at 12 Main St"]);
  assert.equal(p.later, 1, "after this week");
  assert.equal(weekSpeech(p), "Today: answer notice ER01720; 3 bids to send; close out A. Tomorrow: close out B; close out C. 1 more day with work is on the screen.");
  for (const t of ["plan my week", "plan the week", "what's coming up this week", "what do I have this week", "my week's plan"]) assert.deepEqual(parseCommand(t), { intent: "plan-week" }, t);
  assert.equal(parseCommand("what's my week look like").intent, "week-ahead");
  assert.equal(parseCommand("how did I do this week").intent, "week");
  for (const t of ["do all", "do them all", "do all of them", "do the plan", "build them all"]) assert.deepEqual(parseCommand(t), { intent: "plan-do-all" }, t);
  assert.equal(parseCommand("do idea 2").intent, "idea-do");

  const { forServer, mergeDayLog, onSaidChange, markBrief, noteSaid, readDayLog, briefDone } = await loadLib("said-today");
  const a = mem();
  const seen = [];
  onSaidChange((log) => seen.push(log.said.length));
  markBrief(D, a, 2000);
  noteSaid(D, "bids:2026-11-05", "16 bids due today", a);
  noteSaid(D, "first:ER00272", "Call Maria Lopez at 718 555 0100", a);
  noteSaid(D, "first:Call Maria back", "Call Maria back", a);
  onSaidChange(null);
  assert.deepEqual(seen, [0, 1, 2, 3], "each change is sent");
  const out = forServer(readDayLog(D, a));
  assert.deepEqual(out.said.map((x) => [x.key, x.text]), [["bids:2026-11-05", "16 bids due today"], ["first:ER00272", "next: ER00272"]], "no tenant names to the server");
  assert.doesNotMatch(JSON.stringify(out), /Maria|555/);
  // The other phone: nothing said yet. After the merge it doesn't greet again.
  const b = mem();
  assert.equal(briefDone(D, b), false);
  assert.equal(mergeDayLog(out, b), true);
  assert.equal(briefDone(D, b), true);
  assert.equal(noteSaid(D, "bids:2026-11-05", "16 bids due today", b), false, "not said twice across phones");
  assert.equal(mergeDayLog(out, b), false, "nothing new the second time");
  console.log("PASS plan my week (late on today, close-outs 3 a weekday), do all, one greeting across phones (no tenant data on the server)");
}

// 😴 Snooze a reminder: off today's list, back in tomorrow's brief.
{
  const { snooze, isSnoozed, takeSnoozedBack, withoutSnoozed } = await loadLib("said-today");
  const { parseCommand } = await loadLib("voice-agent");
  const m = mem();
  noteSaid("2026-11-05", "notice:ER03009", "notice ER03009 overdue", m);
  noteSaid("2026-11-05", "bids:2026-11-05", "4 bids due today", m);
  snooze("2026-11-05", "notice:ER03009", "notice ER03009 overdue", m);
  assert.equal(isSnoozed("2026-11-05", "notice:ER03009", m), true);
  assert.deepEqual(withoutSnoozed(readDayLog("2026-11-05", m), m).said.map((x) => x.key), ["bids:2026-11-05"]);
  assert.deepEqual(takeSnoozedBack("2026-11-05", m), [], "not back the same day");
  assert.equal(isSnoozed("2026-11-06", "notice:ER03009", m), false, "tomorrow it counts again");
  assert.deepEqual(takeSnoozedBack("2026-11-06", m), ["notice ER03009 overdue"]);
  assert.deepEqual(takeSnoozedBack("2026-11-06", m), [], "said once");
  for (const t of ["not today", "snooze", "snooze it", "remind me tomorrow"]) assert.deepEqual(parseCommand(t), { intent: "snooze" }, t);
  console.log("PASS snooze: not today takes a reminder off today's list and brings it back in tomorrow's brief");
}
