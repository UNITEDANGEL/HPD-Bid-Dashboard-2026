// 📸 🌆 📱 Missing photos, tomorrow's route, quiet tenants (plan items 36-38).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { photoGapLine, isRouteTime, tomorrowRouteLine, quietTenants, followUpText } = await loadLib("quiet-follow");
assert.equal(photoGapLine([]), "");
assert.equal(photoGapLine(["ER1"]), "Photos: 1 finished job has no after photos yet: ER1. HPD rejects the paperwork without them.");
assert.match(photoGapLine(["A", "B", "C", "D", "E"]), /5 finished jobs have no after photos yet: A, B, C and D, and 1 more\./);
assert.equal(isRouteTime(17), false); assert.equal(isRouteTime(18), true); assert.equal(isRouteTime(22), false);
assert.equal(tomorrowRouteLine([]), "");
assert.equal(tomorrowRouteLine([{ address: "1 Main St", text: "📅 appointment 9:00 AM" }, { address: "2 Oak Ave" }], "12 min"),
  "🗺 Tomorrow: 2 stops. 1. 1 Main St (appointment 9:00 AM); 2. 2 Oak Ave. First drive: 12 min.");
const now = Date.parse("2026-11-12T20:00:00Z");
const day = (n) => new Date(now - n * 86400000).toISOString();
const q = quietTenants([
  { OMO: "ER2", TenantTextedAt: day(3) }, { OMO: "ER1", TenantTextedAt: day(5) },
  { OMO: "ER3", TenantTextedAt: day(1) }, { OMO: "ER4", TenantTextedAt: day(4), TenantRepliedAt: day(3) },
  { OMO: "ER5", TenantTextedAt: day(4), FieldOutcome: "WORK_COMPLETED" }, { OMO: "ER6", TenantTextedAt: day(4), AppointmentStart: day(-1) },
  { OMO: "TEST-0001", TenantTextedAt: day(9) }, { OMO: "ER7" },
], now);
assert.deepEqual(q.map((x) => x.id), ["ER1", "ER2"], "2+ days, no reply, no visit, no appointment, oldest first");
assert.match(followUpText("5 Elm St", "3B"), /repair at 5 Elm St, apartment 3B\. Please reply/);
console.log("PASS quiet follow: photo gaps, 6 PM route, quiet tenants");
