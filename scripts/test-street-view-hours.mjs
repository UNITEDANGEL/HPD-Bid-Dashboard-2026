// The building picture is a paid Google Street View call (owner, 26 Oct: "too many API calls from Google, I'm getting
// billed"): shown to you as before, but never loaded by the automatic tests (they open many job cards on every update).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { streetViewAllowed, streetViewPicture } = await loadLib("building-photo");
assert.equal(streetViewAllowed(false), true, "you see it");
assert.equal(streetViewAllowed(true), false, "never in an automatic test browser");
assert.equal(await streetViewPicture({ lat: 40.7, lng: -73.9 }, ""), null, "no key: no call");
console.log("PASS street view: shown to you as before, never loaded by the automatic tests");
