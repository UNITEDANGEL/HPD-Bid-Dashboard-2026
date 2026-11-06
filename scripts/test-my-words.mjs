// 👂 It understands better (plan item 18): it learns your own words.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { learnWords, myMeaning, forgetWords, parseTeach, readWords } = await loadLib("my-words");
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const s = mem();
assert.deepEqual(parseTeach("when I say close it, I mean send the affidavit"), { said: "close it", meaning: "send the affidavit" });
assert.deepEqual(parseTeach("From now on when I say \"my week\" do plan my week."), { said: "my week", meaning: "plan my week" });
assert.deepEqual(parseTeach("close it means send the affidavit"), { said: "close it", meaning: "send the affidavit" });
assert.deepEqual(parseTeach("forget close it"), { forget: "close it" });
assert.equal(parseTeach("what does that mean"), null);
assert.equal(parseTeach("plan my week"), null);
assert.equal(learnWords("Close it!", "send the affidavit", s), true);
assert.equal(myMeaning("close it", s), "send the affidavit", "case and punctuation don't matter");
assert.equal(myMeaning("close it now", s), "", "only the same words");
assert.equal(learnWords("plan my week", "Plan my week.", s), false, "not a word for itself");
assert.equal(forgetWords("close it", s), true);
assert.equal(myMeaning("close it", s), "");
assert.deepEqual(readWords(s), {});
console.log("PASS your own words: taught (when I say X, I mean Y / X means Y), done straight away, forgotten on request");

// 🔁 It follows up by itself (plan item 19): "I'll call the tenant after lunch" = a reminder at that time.
{
  const { parseCommand } = await loadLib("voice-agent");
  const P = (t) => parseCommand(t);
  assert.deepEqual(P("I'll call the tenant after lunch"), { intent: "remind", what: "call the tenant", self: true, time: "13:30" });
  assert.equal(P("let me fax it at 3 pm").time, "15:00");
  assert.equal(P("I will send the affidavit for EQ15239 tomorrow").what, "send the affidavit for EQ15239");
  assert.equal(P("I'm going to text Lewis tonight").time, "19:00");
  assert.notEqual(P("I'll do it").intent, "remind", "no time said: not a reminder");
  assert.notEqual(P("I'm parked").intent, "remind");
  assert.equal(P("remind me to call Lewis at 3").self, undefined, "remind me stays as before");
  console.log("PASS follows up by itself: I'll / let me / I'm going to … with a time = a reminder then (no time = nothing)");
}
