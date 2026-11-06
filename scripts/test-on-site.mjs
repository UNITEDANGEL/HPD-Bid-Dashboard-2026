// 🔨 Working here now + time on site (owner, 6 Nov).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { onSite, duration, onSiteRecord } = await loadLib("on-site");
const now = Date.parse("2026-11-06T15:30:00-05:00");
const arrived = "2026-11-06T14:10:00-05:00";
assert.deepEqual(onSite({ FieldArrivedAt: arrived }, now), { since: Date.parse(arrived), minutes: 80 });
assert.deepEqual(onSite({ FieldArrivedAt: arrived, FieldOutcome: "WORK_STARTED", OutcomeLockedAt: "2026-11-06T14:20:00-05:00" }, now)?.minutes, 80, "work started: still there");
assert.equal(onSite({ FieldArrivedAt: arrived, FieldOutcome: "WORK_COMPLETED", OutcomeLockedAt: "2026-11-06T15:00:00-05:00" }, now), null, "finished");
assert.equal(onSite({ FieldArrivedAt: "2026-11-05T14:10:00-05:00" }, now), null, "yesterday");
assert.equal(onSite({ FieldArrivedAt: arrived, OnSiteEndedAt: "2026-11-06T15:00:00-05:00" }, now), null, "left");
assert.ok(onSite({ FieldArrivedAt: arrived, FieldOutcome: "NO_ACCESS", OutcomeLockedAt: "2026-11-06T13:00:00-05:00" }, now), "an older outcome (before this arrival): still on site");
assert.equal(duration(80), "1 h 20 min");
assert.equal(duration(7), "7 min");
assert.equal(onSiteRecord(Date.parse(arrived), Date.parse("2026-11-06T15:45:00-05:00")), "On site 2:10 PM – 3:45 PM (1 h 35 min)");
console.log("PASS on site: the job you arrived at today with no outcome since, time counted from the arrival, kept when it ends");
