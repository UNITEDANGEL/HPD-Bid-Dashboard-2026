// Answer the owner's "Ask for a change" requests inside the app (What's new -> Your requests): a status, a
// progress counter (steps, done / total), "Claude is working on this now", and dated progress notes, stored next
// to the request on the status server (CHANGE-REPLY-<same id>). No tenant names / phones: the server isn't private.
//     node scripts/reply-change-request.mjs --list
//     node scripts/reply-change-request.mjs --check     (BUSY / OPEN <n> / NONE)
//     node scripts/reply-change-request.mjs --wait 9    (waits up to 9 minutes for a new request, looking every 20 s)
//     node scripts/reply-change-request.mjs --id <id> --status "Working on it" --working --steps "Read the emails|Check each OMO|Build it|Test|Push" --update "..."
//     node scripts/reply-change-request.mjs --id <id> --done 2 --update "..."      (step 2 done; --done all = every step)
//     node scripts/reply-change-request.mjs --id <id> --idle                       (no longer working on it right now)
//     --status "Waiting for you"   (needs the owner's answer: not picked up again until they write)
import fs from "node:fs";

const URL_ = /HPD_STATUS_WORKER_URL = "([^"]+)"/.exec(fs.readFileSync(new URL("../lib/paperwork.ts", import.meta.url), "utf8"))[1];
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : ""; };
const flag = (name) => process.argv.includes(`--${name}`);
const load = async () => (await (await fetch(`${URL_}/overrides`, { cache: "no-store" })).json()).overrides || {};
const all = await load();
const requests = Object.entries(all).filter(([k]) => k.startsWith("CHANGE-REQUEST-")).sort(([a], [b]) => a.localeCompare(b));

// Open = not "Done" and not "Waiting for you". Busy = another run's green light is under 30 minutes old.
const openOnes = (o) => Object.keys(o).filter((k) => k.startsWith("CHANGE-REQUEST-")).filter((k) => !["Done", "Waiting for you"].includes(o[`CHANGE-REPLY-${k.slice(15)}`]?.status || "Received"));
const busyNow = (o) => Object.entries(o).some(([k, v]) => k.startsWith("CHANGE-REPLY-") && v?.workingAt && Date.now() - Date.parse(v.workingAt) < 30 * 60000);

if (flag("check")) {
  const open = openOnes(all);
  console.log(busyNow(all) ? "BUSY" : open.length ? `OPEN ${open.length}` : "NONE");
  process.exit(0);
}
// Wait up to <minutes> (max 9, so one command fits the tool time limit), looking every 20 seconds; returns as soon
// as there's an open request no one is working on ("OPEN <n>"), else "NONE".
if (flag("wait")) {
  const until = Date.now() + Math.min(9, Number(arg("wait")) || 9) * 60000;
  let o = all;
  for (;;) {
    const open = openOnes(o);
    if (open.length && !busyNow(o)) { console.log(`OPEN ${open.length}`); process.exit(0); }
    if (Date.now() + 20000 > until) { console.log("NONE"); process.exit(0); }
    await new Promise((r) => setTimeout(r, 20000));
    try { o = await load(); } catch { /* try again next time */ }
  }
}
if (flag("list")) {
  for (const [k, v] of requests) {
    const id = k.slice("CHANGE-REQUEST-".length);
    const r = all[`CHANGE-REPLY-${id}`];
    const steps = r?.steps || [];
    console.log(`${id} | ${v.text}\n   -> ${r ? `${r.status}${steps.length ? ` · ${steps.filter((s) => s.done).length}/${steps.length} steps` : ""} · ${r.updates?.length || 0} update(s)` : "NO REPLY YET"}`);
  }
  process.exit(0);
}
const id = arg("id");
if (!requests.some(([k]) => k === `CHANGE-REQUEST-${id}`)) { console.error(`No request ${id}. Use --list.`); process.exit(1); }
const old = all[`CHANGE-REPLY-${id}`] || { updates: [], steps: [] };
let steps = Array.isArray(old.steps) ? old.steps : [];
if (arg("steps")) steps = arg("steps").split("|").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: steps.find((s) => s.text === text)?.done || false }));
const done = arg("done");
if (done === "all") steps = steps.map((s) => ({ ...s, done: true }));
else if (done) for (const n of done.split(",").map(Number)) if (steps[n - 1]) steps[n - 1] = { ...steps[n - 1], done: true };
const text = arg("update");
const reply = {
  status: arg("status") || (steps.length && steps.every((s) => s.done) ? "Done" : old.status || "Received"),
  steps,
  workingAt: flag("idle") ? "" : flag("working") ? new Date().toISOString() : old.workingAt || "",
  updates: [...(old.updates || []), ...(text ? [{ at: new Date().toISOString(), text: text.slice(0, 3000) }] : [])].slice(-30),
};
const res = await fetch(`${URL_}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-REPLY-${id}`, patch: reply }) });
console.log(res.ok ? `Replied to ${id}: ${reply.status}${steps.length ? ` · ${steps.filter((s) => s.done).length}/${steps.length}` : ""}${text ? " + update" : ""}${reply.workingAt ? " · working now" : ""}` : `Failed: HTTP ${res.status}`);
