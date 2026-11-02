// The chat on the map (owner, 2 Nov: "a chat on the map, better flow"): what's typed or said moves the map. Bids by
// borough / day, the next bid, and "where's my 2 PM"; the older bid questions still mean what they did.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseCommand } = await loadLib("voice-agent");
const show = (said, boro, day = "all") => assert.deepEqual(parseCommand(said), { intent: "bids-show", boro, day }, said);
show("Show me the bids in Brooklyn", "BK");
show("bids in queens", "QN");
show("today's bids in the Bronx", "BX", "0");
show("show tomorrow's bids in Staten Island", "SI", "1");
show("Manhattan bids", "MN");
show("show me the bids on the map", "");
show("show today's bids", "", "0");
for (const said of ["next bid", "Next bid.", "go to the next bid", "open the next bid please", "start bidding", "let's bid", "next invitation"]) {
  assert.equal(parseCommand(said).intent, "next-bid", said);
}
const at = (said, minutes) => assert.deepEqual(parseCommand(said), { intent: "where-appt", at: minutes }, said);
at("where's my 2 PM?", 14 * 60);
at("where is my 2:30 p.m. appointment", 14 * 60 + 30);
at("where's my 10 o'clock", 10 * 60);
at("where's my 11", 11 * 60);
at("where's my 3 o'clock", 15 * 60);
at("where's my 12", 12 * 60);
at("where's my 9 am job", 9 * 60);
at("where's my next appointment", -1);
at("where is my next stop", -1);
// Unchanged.
assert.equal(parseCommand("read me the new bids").intent, "bids");
assert.equal(parseCommand("any new bids").intent, "bids");
assert.equal(parseCommand("how many bids in Queens").intent, "bids");
assert.equal(parseCommand("what should I bid").intent, "bid-advice");
assert.equal(parseCommand("bid 450").intent, "bid-price");
assert.equal(parseCommand("no bid, too far").intent, "no-bid");
assert.equal(parseCommand("next tenant").intent, "next-tenant");
assert.equal(parseCommand("what appointments do I have today").intent, "appointments");
assert.equal(parseCommand("where should I go first").intent, "plan");
console.log("PASS the chat on the map: bids by borough and day (7 ways), next bid (7), where's my 2 PM / next appointment (9); older bid, tenant and appointment questions unchanged");
