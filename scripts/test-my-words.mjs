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
