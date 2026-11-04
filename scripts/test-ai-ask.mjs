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
assert.match(system, /don't\s+guess/, "asks back when unsure");
assert.match(system, /facts\.myNotes/);
assert.match(system, /facts\.trends/);
assert.match(system, /'remember <what>'/);
assert.match(sent.body.messages[1].content, /"bidsSent":\{"today":4\}/);
assert.match(APP_GUIDE, /Bottom buttons: Jobs, Bids, the 🤖 robot/);
// 🧠 The conversation goes as real turns (not inside the facts), so "why?" follows on from the last answer.
let turns = null;
const env2 = { AI: { run: async (model, body) => { turns = body.messages; return { response: "Because most of them are small plumbing jobs." }; } } };
const ask2 = askFacts({ question: "why?", facts: { a: 1, recentConversation: [{ you: "how many bids did I win this week", helper: "You won 3 bids this week." }, { you: "", helper: "dropped" }] } });
assert.equal(ask2.facts.recentConversation, undefined, "the conversation is not sent twice");
const r2 = await aiAnswer(env2, ask2);
assert.equal(r2.ai, true);
assert.deepEqual(turns.slice(1, 3), [{ role: "user", content: "how many bids did I win this week" }, { role: "assistant", content: "You won 3 bids this week." }]);
assert.match(turns[3].content, /Question: why\?$/);
assert.equal(turns.length, 4);
// ⛑ The big model busy or out of today's allowance: the free backup model answers.
const tried = [];
const env3 = { AI: { run: async (model) => { tried.push(model); if (tried.length === 1) throw new Error("3040: Capacity temporarily exceeded"); return { response: "You have 2 jobs today." }; } } };
const r3 = await aiAnswer(env3, askFacts({ question: "what do I have today", facts: {} }));
assert.equal(r3.ai, true);
assert.equal(r3.model, "@cf/meta/llama-3.1-8b-instruct-fast");
assert.equal(tried.length, 2);
const env4 = { AI: { run: async () => { throw new Error("down"); } } };
const r4 = await aiAnswer(env4, askFacts({ question: "what do I have today", facts: {} }));
assert.equal(r4.ai, false);
assert.match(r4.reason, /busy right now/);
console.log("ai ask ok: the conversation as real turns, a backup model when the big one is busy; long facts shortened per list (never cut mid-way), the app guide and general knowledge in the instructions, facts and question sent");
