// 🗣 The robot starts talking right away (idea list, 6 Nov): the server's word-by-word answer (fake Workers AI, no real
// AI) and the phone's reader: pieces as they come, the first sentence found before the rest, the cleaned whole answer
// at the end; a busy model falls to the backup; no Workers AI = null (the normal answer).
import assert from "node:assert/strict";
import { aiAnswerStream, cleanAnswer } from "../server/ai-draft.mjs";
import { loadLib } from "./daily-report.mjs";

const { firstSentence, readAnswerStream, restAfter } = await loadLib("stream-talk");
const sse = (pieces) => new ReadableStream({ start(c) { const e = new TextEncoder(); for (const p of pieces) c.enqueue(e.encode(`data: ${JSON.stringify({ response: p })}\n\n`)); c.enqueue(e.encode("data: [DONE]\n\n")); c.close(); } });
const ask = { question: "what's next?", facts: { now: "Mon" }, history: [] };

// Word by word.
const calls = [];
const env = { AI: { run: async (model, input) => { calls.push({ model, stream: input.stream }); return sse(["You have ", "2 stops today. ", "The first is ", "EQ15239 at 9.\nDO: open EQ15239\nASK: What should I bring?"]); } } };
const stream = await aiAnswerStream(env, ask);
assert.ok(stream);
assert.equal(calls[0].stream, true);
const res = new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
const seen = [];
const d = await readAnswerStream(res, (so) => seen.push(so));
assert.equal(d.ai, true);
assert.equal(d.text, "You have 2 stops today. The first is EQ15239 at 9.\nDO: open EQ15239\nASK: What should I bring?");
assert.equal(d.text, cleanAnswer("You have 2 stops today. The first is EQ15239 at 9.\nDO: open EQ15239\nASK: What should I bring?"));
assert.deepEqual(seen.slice(0, 2), ["You have ", "You have 2 stops today. "]);
// The first sentence is ready on the 2nd piece, before the rest came.
assert.equal(firstSentence(seen[0]), "");
assert.equal(firstSentence(seen[1]), "You have 2 stops today.");
assert.equal(firstSentence("Hi."), "", "too short / maybe not finished");
assert.equal(firstSentence("You have 2 stops today"), "", "not finished");
assert.equal(firstSentence("DO: open EQ1\n"), "");
assert.equal(firstSentence("**Yes**, you have 3 bids due. More"), "Yes, you have 3 bids due.");
assert.equal(restAfter("You have 2 stops today. The first is at 9.", "You have 2 stops today."), "The first is at 9.");
assert.equal(restAfter("Something else. Yes.", "You have 2 stops today."), null);

// The big model busy -> the backup model.
const env2 = { AI: { run: async (model) => { if (!/8b/.test(model)) throw new Error("busy"); return sse(["Backup here. ", "All good."]); } } };
const d2 = await readAnswerStream(new Response(await aiAnswerStream(env2, ask), { headers: { "Content-Type": "application/x-ndjson" } }), () => {});
assert.equal(d2.text, "Backup here. All good.");
assert.match(d2.model, /8b/);

// Nothing came -> ai false (the phone asks once more the normal way).
const env3 = { AI: { run: async () => sse([]) } };
const d3 = await readAnswerStream(new Response(await aiAnswerStream(env3, ask), { headers: { "Content-Type": "application/x-ndjson" } }), () => {});
assert.equal(d3.ai, false);

// No Workers AI -> null; a plain JSON answer still reads.
assert.equal(await aiAnswerStream({}, ask), null);
assert.deepEqual(await readAnswerStream(Response.json({ ai: true, text: "Plain." }), () => {}), { ai: true, text: "Plain." });
console.log("PASS ask stream: word by word from the AI, first sentence ready before the rest, cleaned whole answer at the end, backup model, plain JSON still works");
