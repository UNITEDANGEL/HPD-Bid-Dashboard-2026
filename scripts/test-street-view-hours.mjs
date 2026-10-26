// The building photo is a paid Google Street View call (owner, 26 Oct: "too many API calls from Google, I'm getting
// billed; 7 AM - 7 PM Mon-Sat"): only Monday to Saturday 7 AM - 7 PM New York, and never from the automatic tests.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { streetViewAllowed, streetViewPicture } = await loadLib("building-photo");
const at = (iso) => streetViewAllowed(new Date(iso), false);
assert.equal(at("2026-10-26T11:00:00Z"), true, "Monday 7:00 AM EDT");
assert.equal(at("2026-10-26T22:59:00Z"), true, "Monday 6:59 PM");
assert.equal(at("2026-10-26T23:00:00Z"), false, "Monday 7:00 PM");
assert.equal(at("2026-10-26T10:59:00Z"), false, "Monday 6:59 AM");
assert.equal(at("2026-10-24T15:00:00Z"), true, "Saturday 11 AM");
assert.equal(at("2026-10-25T15:00:00Z"), false, "Sunday 11 AM");
assert.equal(at("2026-12-15T12:30:00Z"), true, "winter (EST) 7:30 AM");
assert.equal(streetViewAllowed(new Date("2026-10-26T15:00:00Z"), true), false, "never in an automatic test browser");
// No key: no call at all.
assert.equal(await streetViewPicture({ lat: 40.7, lng: -73.9 }, ""), null);
console.log("PASS street view hours: Mon-Sat 7 AM-7 PM New York only (summer and winter), never on Sunday or in test browsers");
