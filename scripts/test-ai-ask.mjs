// 🧠 The robot's free questions (4 Nov, "make the bot super smart"): the AI gets the app guide (how every screen and
// button works) and the facts fit without being cut mid-way. No real AI is called here.
import assert from "node:assert/strict";
import { askFacts, aiAnswer, fitFacts } from "../server/ai-draft.mjs";
import { APP_GUIDE } from "../lib/app-guide.mjs";

// Facts that are too long: the longest list is shortened (and says so), the rest stays whole JSON.
const big = { notices: Array.from({ length: 200 }, (_, i) => ({ job: `ER${String(i).padStart(5, "0")}`, want: "x".repeat(120) })), nextStep: "notice ER00001 overdue", numbers: { thisWeek: { completed: 3 } } };
const fit = fitFacts(big);
assert.ok(JSON.stringify(fit).length <= 20000);
assert.ok(fit.notices.length < 200 && fit.notices.length > 10);
assert.match(fit.noticesNote, /only the first \d+ of 200 shown/);
assert.deepEqual(fit.numbers, { thisWeek: { completed: 3 } });
assert.equal(fit.nextStep, "notice ER00001 overdue");
const small = { a: [1, 2, 3], b: "x" };
assert.deepEqual(fitFacts(small), small, "small facts unchanged");
assert.equal(askFacts({ question: "hi", facts: {} }), null, "too short");

// The AI sees the guide and the question with the facts.
let sent = null;
const env = { AI: { run: async (model, body) => { sent = { model, body }; return { response: "You sent 4 bids today.\nDO: read me the new bids" }; } } };
const r = await aiAnswer(env, askFacts({ question: "How many bids did I send today?", facts: { bidsSent: { today: 4 } } }));
assert.equal(r.ai, true);
assert.equal(r.text, "You sent 4 bids today.\nDO: read me the new bids");
const system = sent.body.messages[0].content;
assert.ok(system.includes(APP_GUIDE), "the app guide goes with every question");
assert.match(system, /how to use the app/);
assert.match(system, /general knowledge/);
assert.match(sent.body.messages[1].content, /"bidsSent":\{"today":4\}/);
assert.match(APP_GUIDE, /Bottom buttons: Jobs, Bids, the 🤖 robot/);
console.log("ai ask ok: long facts shortened per list (never cut mid-way), the app guide and general knowledge in the instructions, facts and question sent");
