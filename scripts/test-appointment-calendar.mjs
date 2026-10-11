// The "Add to Calendar" server function: builds the iPhone calendar entry from the button's link.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-cal-"));
fs.mkdirSync(path.join(dir, "lib")); fs.mkdirSync(path.join(dir, "functions", "api"), { recursive: true });
const compile = (src) => ts.transpileModule(fs.readFileSync(src, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
fs.writeFileSync(path.join(dir, "lib", "appointments.mjs"), compile("lib/appointments.ts"));
fs.writeFileSync(path.join(dir, "functions", "api", "appointment-calendar.mjs"), fs.readFileSync("functions/api/appointment-calendar.js", "utf8").replace("../../lib/appointments.ts", "../../lib/appointments.mjs"));
const { onRequestGet } = await import(path.join(dir, "functions", "api", "appointment-calendar.mjs"));
const { appointmentCalendarHref } = await import(path.join(dir, "lib", "appointments.mjs"));

const appointment = { date: "2099-10-07", start: "14:00", end: "15:00", state: "requested", contact: "Maria Lopez", phone: "917-555-0100", note: "Ring 4B", reminder: 60 };
const href = appointmentCalendarHref("ER05729", "500 FT WASHINGTON AVENUE, 10033", appointment, "https://hpd.example");
const response = await onRequestGet({ request: new Request(href) });
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /^text\/calendar/);
assert.match(response.headers.get("content-disposition"), /HPD-ER05729-appointment\.ics/);
const ics = await response.text();
assert.match(ics, /DTSTART;TZID=America\/New_York:20991007T140000/);
assert.match(ics, /DTEND;TZID=America\/New_York:20991007T150000/);
assert.match(ics, /SUMMARY:HPD ER05729 appointment \(requested\)/);
assert.match(ics, /LOCATION:500 FT WASHINGTON AVENUE\\, 10033/);
assert.match(ics, /Maria Lopez\\n917-555-0100\\nRing 4B/);
assert.match(ics, /URL:https:\/\/hpd\.example\/map\/\?job=ER05729/);
assert.deepEqual([...ics.matchAll(/TRIGGER:-PT(\d+)M/g)].map((m) => m[1]), ["60", "15"], "alerts 1 hour and 15 minutes before");
assert.match(ics, /DESCRIPTION:HPD ER05729 in 1 hour: 500 FT WASHINGTON AVENUE/);
// "None" reminder: no alerts. A cancelled appointment or a missing job number is refused.
const none = await (await onRequestGet({ request: new Request(appointmentCalendarHref("ER1", "A", { ...appointment, reminder: 0 }, "https://x")) })).text();
assert.doesNotMatch(none, /VALARM/);
assert.equal((await onRequestGet({ request: new Request(appointmentCalendarHref("ER1", "A", { ...appointment, state: "cancelled" }, "https://x")) })).status, 400);
assert.equal((await onRequestGet({ request: new Request("https://x/api/appointment-calendar?date=2099-10-07&start=14:00&end=15:00") })).status, 400);
fs.rmSync(dir, { recursive: true, force: true });
console.log("PASS appointment calendar: iPhone calendar entry with 1-hour and 15-minute alerts, address, tenant, job link; refusals");
