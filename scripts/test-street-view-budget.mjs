// Google's free 10,000 Street View pictures a month (owner, 2 Nov: "stop after you reach that limit; a counter in the
// app so we never trigger any billing"): each picture is counted on the phone, sent to the status server every 20 (and
// the first), every device's count adds up, and pictures stop at 9,000 for the month. Server faked.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const posts = [];
let server = {};
globalThis.fetch = async (url, opts = {}) => {
  if (opts.method === "POST") { const b = JSON.parse(opts.body); posts.push(b); server[b.key] = b.patch; return new Response("{}", { status: 200 }); }
  return Response.json({ overrides: server });
};
const sv = await loadLib("street-view-budget");
const month = sv.svMonth();
assert.match(month, /^\d{4}-\d\d$/);
assert.equal(sv.svMonth(new Date("2026-11-01T05:00:00Z")), "2026-10", "Google's month is Pacific time: 1 AM New York on the 1st is still October there");
store["hpd-field-device-id-v1"] = "phone1";

// Another device already used 8,990 this month.
server[`SV-COUNT-${month}-computer`] = { n: 8990 };
server[`SV-COUNT-2026-01-computer`] = { n: 9999 }; // an old month doesn't count
let b = await sv.streetViewBudget();
assert.deepEqual(b, { used: 8990, stopAt: 9000, free: 10000, allowed: true });

// This phone downloads 10 pictures: the first is sent at once, then every 20 (so not again yet).
for (let i = 0; i < 10; i++) sv.countStreetViewPicture();
await new Promise((r) => setTimeout(r, 20));
assert.equal(posts.length, 1, "the first picture is sent, then every 20");
assert.deepEqual(posts[0].patch.n, 1);
assert.equal(posts[0].key, `SV-COUNT-${month}-phone1`);
b = await sv.streetViewBudget();
assert.equal(b.used, 9000, "8,990 + this phone's 10 (its own count is always current)");
assert.equal(b.allowed, false, "9,000 reached: no more pictures this month");

// 20 after the last send: sent again.
for (let i = 0; i < 11; i++) sv.countStreetViewPicture();
await new Promise((r) => setTimeout(r, 20));
assert.equal(posts.length, 2);
assert.equal(posts[1].patch.n, 21);

// The sums.
assert.equal(sv.monthTotal({ a: 100, b: 50, me: 3 }, "me", 7), 157, "my own count from the phone, not the server's older one");
assert.deepEqual(sv.serverCounts({ [`SV-COUNT-${month}-x`]: { n: 5 }, "SV-COUNT-1999-01-y": { n: 9 }, OTHER: {} }, month), { x: 5 });
console.log("PASS free Google pictures: counted per phone, sent on the 1st and every 20, all devices add up, stops at 9,000 a month (under the free 10,000), Pacific-time month");
