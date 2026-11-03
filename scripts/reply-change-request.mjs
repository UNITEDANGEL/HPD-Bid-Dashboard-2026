// Answer the owner's "Ask for a change" requests inside the app (What's new -> Your requests): a status, a
// progress counter (steps, done / total), "Claude is working on this now", and dated progress notes, stored next
// to the request on the status server (CHANGE-REPLY-<same id>). No tenant names / phones: the server isn't private.
//     node scripts/reply-change-request.mjs --list
//     node scripts/reply-change-request.mjs --check     (BUSY / OPEN <n> / NONE)
//     node scripts/reply-change-request.mjs --wait 9    (waits up to 9 minutes for a new request, looking every 20 s)
//     node scripts/reply-change-request.mjs --id <id> --status "Working on it" --working --steps "Read the emails|Check each OMO|Build it|Test|Push" --update "..."
//     node scripts/reply-change-request.mjs --id <id> --done 2 --update "..."      (step 2 done; --done all = every step)
//     node scripts/reply-change-request.mjs --id <id> --idle                       (no longer working on it right now)
//     node scripts/reply-change-request.mjs --id <id> --now "Running the tests"    (the live "Now:" line; also keeps the green light on)
//     --status "Waiting for you"   (needs the owner's answer: not picked up again until they write)
//     --try "/map/?view=all&map=1&bids=1"   (with Done: the app's ▶ Try it opens that screen; a path on the site)
//     Done or Waiting for you sends one phone alert (scripts/claude-alert.mjs); --no-alert leaves it out.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { claudeAlert } from "./claude-alert.mjs";

const URL_ = /HPD_STATUS_WORKER_URL = "([^"]+)"/.exec(fs.readFileSync(new URL("../lib/paperwork.ts", import.meta.url), "utf8"))[1];
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : ""; };
const flag = (name) => process.argv.includes(`--${name}`);
const load = async () => (await (await fetch(`${URL_}/overrides`, { cache: "no-store" })).json()).overrides || {};
const all = await load();
const requests = Object.entries(all).filter(([k]) => k.startsWith("CHANGE-REQUEST-")).sort(([a], [b]) => a.localeCompare(b));

// Open = not "Done" and not "Waiting for you". Busy = another run's green light is under 30 minutes old.
// The owner's answer (CHANGE-ANSWER-<id>, from the app) after Claude's last note opens a request again.
const lastAt = (list) => (Array.isArray(list) ? list.map((x) => x?.at || "").sort().slice(-1)[0] : "") || "";
const answeredSince = (o, id) => lastAt(o[`CHANGE-ANSWER-${id}`]?.answers) > lastAt(o[`CHANGE-REPLY-${id}`]?.updates);
const openOnes = (o) => Object.keys(o).filter((k) => k.startsWith("CHANGE-REQUEST-")).filter((k) => answeredSince(o, k.slice(15)) || !["Done", "Waiting for you"].includes(o[`CHANGE-REPLY-${k.slice(15)}`]?.status || "Received"));
const busyNow = (o) => Object.entries(o).some(([k, v]) => k.startsWith("CHANGE-REPLY-") && v?.workingAt && Date.now() - Date.parse(v.workingAt) < 30 * 60000);

// "Claude is on" for the app (owner, 2 Nov: "do I have to leave Claude open?"): every check and every wait writes the
// time to CLAUDE-HEARTBEAT, so the app can say whether requests are being picked up right now or wait for the computer.
// About once per 9-minute wait, so the status server's daily write limit isn't touched.
const heartbeat = () => fetch(`${URL_}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "CLAUDE-HEARTBEAT", patch: { at: new Date().toISOString(), every: 9 } }) }).catch(() => {});

if (flag("check")) {
  await heartbeat();
  const open = openOnes(all);
  console.log(busyNow(all) ? "BUSY" : open.length ? `OPEN ${open.length}` : "NONE");
  process.exit(0);
}
// Wait up to <minutes> (max 9, so one command fits the tool time limit), looking every 20 seconds; returns as soon
// as there's an open request no one is working on ("OPEN <n>"), else "NONE".
if (flag("wait")) {
  await heartbeat();
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
    const answers = (all[`CHANGE-ANSWER-${id}`]?.answers || []).slice(-3).map((a) => `\n   <- owner's answer (${a.at.slice(0, 16)}): ${a.text}`).join("");
    console.log(`${id} | ${v.text}${answers}${answeredSince(all, id) ? "\n   !! answered after your last note: open again" : ""}${all[`CHANGE-ANSWER-${id}`]?.ok ? "\n   👍 owner checked it: works" : ""}\n   -> ${r ? `${r.status}${steps.length ? ` · ${steps.filter((s) => s.done).length}/${steps.length} steps` : ""} · ${r.updates?.length || 0} update(s)` : "NO REPLY YET"}`);
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
// Answered after the last note: back to work unless told otherwise (and the next Done / question alerts again).
const answered = answeredSince(all, id);
const reopened = answered && !text;
const reply = {
  status: arg("status") || (steps.length && steps.every((s) => s.done) && !reopened ? "Done" : reopened ? "Working on it" : old.status || "Received"),
  steps,
  workingAt: flag("idle") ? "" : flag("working") || arg("now") ? new Date().toISOString() : old.workingAt || "",
  // The live line the app shows under "working on it now" with its seconds (owner, 2 Nov: "every second").
  now: flag("idle") || done === "all" ? null : arg("now") ? { at: new Date().toISOString(), text: arg("now").slice(0, 200) } : old.now || null,
  try: /^\/[^/]/.test(arg("try")) ? arg("try").slice(0, 300) : old.try || "",
  updates: [...(old.updates || []), ...(text ? [{ at: new Date().toISOString(), text: text.slice(0, 3000) }] : [])].slice(-30),
};
const res = await fetch(`${URL_}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-REPLY-${id}`, patch: reply }) });
const alert = res.ok && !flag("no-alert") ? claudeAlert(answered ? "Received" : old.status, reply, all[`CHANGE-REQUEST-${id}`]?.text) : null;
if (alert) {
  const out = spawnSync(process.execPath, ["scripts/send-push.mjs", "--alert", "--title", alert.title, "--body", alert.body, "--url", alert.url], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  console.log(`Phone alert: ${(out.stdout || out.stderr || "").trim().split("\n").pop()}`);
}
console.log(res.ok ? `Replied to ${id}: ${reply.status}${steps.length ? ` · ${steps.filter((s) => s.done).length}/${steps.length}` : ""}${text ? " + update" : ""}${reply.workingAt ? " · working now" : ""}` : `Failed: HTTP ${res.status}`);
