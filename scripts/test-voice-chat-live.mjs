// The chat, more interactive (owner, 2 Nov: "I want the chat to be very interactive; I need to know exactly what's going
// on"): "what's Claude doing" / "status of my request" -> claude-status; "open the second one" / "open number 2" ->
// open-pick (the card with that number). A bare "the second one" still reads that job; "tell Claude to …" is a request.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseCommand } = await loadLib("voice-agent");
const status = ["What's Claude doing?", "is Claude done", "what is cloud working on", "Claude status", "status of my request", "how's my request going", "is my request done", "my requests", "any updates from Claude"];
for (const s of status) assert.deepEqual(parseCommand(s), { intent: "claude-status" }, s);
const picks = [["open the second one", 2], ["open number 2", 2], ["open number three", 3], ["take me to the third one", 3], ["go to the first", 1], ["open 4", 4], ["show me the 2nd bid", 2], ["open #5", 5]];
for (const [s, n] of picks) assert.deepEqual(parseCommand(s), { intent: "open-pick", pick: n }, s);
assert.deepEqual(parseCommand("the second one"), { intent: "read-job", ref: "", pick: 2 });
assert.equal(parseCommand("tell Claude to make the buttons bigger").intent, "app-request");
assert.equal(parseCommand("status of EQ15239").intent, "job-status");
assert.equal(parseCommand("open ER08092").intent === "open-pick", false);
// Checking a finished upgrade by voice: 👍 or what's not right (sent to Claude on that request).
const works = ["it works", "It works now, thanks Claude", "looks good", "that works great", "the fix works", "it's working", "the upgrade is good", "works great"];
for (const w of works) assert.deepEqual(parseCommand(w), { intent: "claude-works" }, w);
assert.deepEqual(parseCommand("Not right, the button is still too small."), { intent: "claude-not-right", text: "the button is still too small" });
assert.deepEqual(parseCommand("it doesn't work: Clear is hidden again"), { intent: "claude-not-right", text: "Clear is hidden again" });
assert.deepEqual(parseCommand("not right"), { intent: "claude-not-right", text: "" });
assert.equal(parseCommand("yes").intent, "yes");
assert.equal(parseCommand("the gps is not working").intent === "claude-not-right", false);
// Your usual price on the open bid (3 Nov).
for (const w of ["bid the usual", "the usual", "my usual price", "same as last time", "bid my last price", "put the usual on it", "what I usually charge"]) assert.deepEqual(parseCommand(w), { intent: "bid-usual" }, w);
assert.equal(parseCommand("bid 500").intent, "bid-price");
// While you were away (3 Nov).
for (const w of ["What did I miss?", "catch me up", "what happened while I was out", "did I miss anything", "fill me in", "what happened today"]) assert.deepEqual(parseCommand(w), { intent: "catch-up" }, w);
assert.equal(parseCommand("anything new").intent, "whats-new");
// What changed in the app, read out (3 Nov).
for (const w of ["What's new?", "what's new in the app", "what did you upgrade", "What did Claude change today", "what changed", "read me the latest updates", "new features", "anything new"]) assert.deepEqual(parseCommand(w), { intent: "whats-new" }, w);
assert.equal(parseCommand("what's new with ER08092").intent === "whats-new", false);
assert.equal(parseCommand("what's next").intent, "whats-next");
console.log(`PASS chat live words: ${status.length} ways to ask what Claude is doing, ${picks.length} ways to open a numbered card; it works / not right, … for a finished upgrade; "what's new" reads the newest changes; "what did I miss" catches you up; "bid the usual"; "the second one" still reads it`);
