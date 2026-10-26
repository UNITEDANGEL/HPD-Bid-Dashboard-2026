import assert from "node:assert/strict";
import { tick, newYorkMinute } from "./src/index.js";

const calls = [];
const github = (queuedCount, dispatchStatus = 204) => async (url, opts = {}) => {
  calls.push({ url, method: opts.method || "GET", body: opts.body, auth: opts.headers?.Authorization });
  if (url.includes("status=queued")) return new Response(JSON.stringify({ total_count: queuedCount }), { status: 200 });
  return new Response(dispatchStatus === 204 ? null : "bad credentials", { status: dispatchStatus });
};
const env = { GITHUB_DISPATCH_TOKEN: "test-token" };

// 3:50 PM New York (daylight savings, 19:50 UTC): the 13 Oct invitations came in now; a fetch starts.
assert.equal(newYorkMinute(new Date("2026-10-13T19:50:00Z")), 15 * 60 + 50);
let r = await tick(env, new Date("2026-10-13T19:50:00Z"), github(0));
assert.equal(r.started, true);
const post = calls.find((c) => c.method === "POST");
assert.match(post.url, /UNITEDANGEL\/HPD-Bid-Dashboard-2026\/actions\/workflows\/run-fetcher\.yml\/dispatches$/);
assert.deepEqual(JSON.parse(post.body), { ref: "main", inputs: { days_back: "14" } });
assert.equal(post.auth, "Bearer test-token");

// Monday to Saturday, 7 AM - 7 PM New York (26 Oct), summer (EDT) and winter (EST): 7:00 AM and 7:00 PM run; 6:50 AM,
// 7:10 PM and any Sunday don't.
assert.equal((await tick(env, new Date("2026-10-14T11:00:00Z"), github(0))).started, true);   // Wed 7:00 AM EDT
assert.equal((await tick(env, new Date("2026-10-14T23:00:00Z"), github(0))).started, true);   // Wed 7:00 PM EDT
assert.equal((await tick(env, new Date("2026-12-15T12:00:00Z"), github(0))).started, true);   // Tue 7:00 AM EST
assert.equal((await tick(env, new Date("2026-12-17T00:00:00Z"), github(0))).started, true);   // Wed 7:00 PM EST
assert.equal((await tick(env, new Date("2026-10-17T15:00:00Z"), github(0))).started, true);   // Saturday 11 AM
assert.equal((await tick(env, new Date("2026-10-14T10:50:00Z"), github(0))).started, false);  // 6:50 AM
assert.equal((await tick(env, new Date("2026-10-14T23:10:00Z"), github(0))).started, false);  // 7:10 PM
const sunday = await tick(env, new Date("2026-10-18T15:00:00Z"), github(0));                  // Sunday 11 AM
assert.equal(sunday.started, false);
assert.match(sunday.why, /Sunday/);

// A fetch already waiting: no extra one. No token: says so, never calls GitHub.
calls.length = 0;
r = await tick(env, new Date("2026-10-13T19:50:00Z"), github(1));
assert.equal(r.started, false);
assert.ok(!calls.some((c) => c.method === "POST"));
calls.length = 0;
r = await tick({}, new Date("2026-10-13T19:50:00Z"), github(0));
assert.match(r.why, /GITHUB_DISPATCH_TOKEN/);
assert.equal(calls.length, 0);

// A pasted token with a line break still works.
calls.length = 0;
await tick({ GITHUB_DISPATCH_TOKEN: " test-token\n" },new Date("2026-10-13T19:50:00Z"), github(0));
assert.equal(calls.find((c) => c.method === "POST").auth, "Bearer test-token");

// GitHub refusing (wrong token) is an error in the Cloudflare log, not silence.
await assert.rejects(tick(env, new Date("2026-10-13T19:50:00Z"), github(0, 401)), /GitHub said 401/);
console.log("PASS invitation timer: every 10 min, Monday-Saturday 7 AM-7 PM New York time (summer and winter), none on Sunday, starts run-fetcher.yml on main, no pile-up, errors are loud");
