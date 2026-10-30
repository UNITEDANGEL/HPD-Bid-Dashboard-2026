// The calling round by voice (30 Oct): "next tenant" and friends open the next tenant not reached yet; the older
// tenant questions and calling one tenant still mean what they did.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseCommand } = await loadLib("voice-agent");
for (const said of ["Next tenant", "next tenant please", "call the next tenant", "go to the next tenant", "Start calling.", "start calling tenants", "who's next to call?", "who should I call next", "next call", "next tenant to call"]) {
  assert.equal(parseCommand(said).intent, "next-tenant", said);
}
assert.equal(parseCommand("who do I need to call").intent, "tenants-waiting");
assert.equal(parseCommand("which tenants haven't answered").intent, "tenants-waiting");
assert.equal(parseCommand("call the tenant").intent, "call-tenant");
assert.equal(parseCommand("I called the tenant for EQ15239, no answer").intent, "called");
assert.equal(parseCommand("what's next").intent, "whats-next");
console.log("PASS next tenant by voice: 10 ways to say it; tenants waiting, call the tenant, called and what's next unchanged");
