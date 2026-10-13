import assert from "node:assert/strict";
import { tick, newYorkHour } from "./src/index.js";

const calls = [];
const github = (queuedCount, dispatchStatus = 204) => async (url, opts = {}) => {
  calls.push({ url, method: opts.method || "GET", body: opts.body, auth: opts.headers?.Authorization });
  if (url.includes("status=queued")) return new Response(JSON.stringify({ total_count: queuedCount }), { status: 200 });
  return new Response(dispatchStatus === 204 ? null : "bad credentials", { status: dispatchStatus });
};
const env = { GITHUB_DISPATCH_TOKEN: "test-token" };

// 3:50 PM New York (daylight savings, 19:50 UTC): the 13 Oct invitations came in now; a fetch starts.
assert.equal(newYorkHour(new Date("2026-10-13T19:50:00Z")), 15);
let r = await tick(env, new Date("2026-10-13T19:50:00Z"), github(0));
assert.equal(r.started, true);
const post = calls.find((c) => c.method === "POST");
assert.match(post.url, /UNITEDANGEL\/HPD-Bid-Dashboard-2026\/actions\/workflows\/run-fetcher\.yml\/dispatches$/);
assert.deepEqual(JSON.parse(post.body), { ref: "main", inputs: { days_back: "14" } });
assert.equal(post.auth, "Bearer test-token");

// 7:00 AM and 10:50 PM in winter (EST) still run; 6:50 AM and 11 PM don't.
assert.equal((await tick(env, new Date("2026-12-15T12:00:00Z"), github(0))).started, true);
assert.equal((await tick(env, new Date("2026-12-16T03:50:00Z"), github(0))).started, true);
assert.equal((await tick(env, new Date("2026-12-15T11:50:00Z"), github(0))).started, false);
assert.equal((await tick(env, new Date("2026-10-14T03:00:00Z"), github(0))).started, false);

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
console.log("PASS invitation timer: every 10 min 7 AM-10 PM New York time (summer and winter), starts run-fetcher.yml on main, no pile-up, errors are loud");
