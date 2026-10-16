// Answer the owner's "Ask for a change" requests inside the app (What's new -> Your requests): a status and
// dated progress updates, stored next to the request on the status server (CHANGE-REPLY-<same id>).
// No tenant names / phones here: the status server isn't private.
//     node scripts/reply-change-request.mjs --list
//     node scripts/reply-change-request.mjs --id 20261016193210 --status "Working on it" --update "What happened / changed"
import fs from "node:fs";

const URL_ = /HPD_STATUS_WORKER_URL = "([^"]+)"/.exec(fs.readFileSync(new URL("../lib/paperwork.ts", import.meta.url), "utf8"))[1];
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : ""; };
const all = (await (await fetch(`${URL_}/overrides`, { cache: "no-store" })).json()).overrides || {};
const requests = Object.entries(all).filter(([k]) => k.startsWith("CHANGE-REQUEST-")).sort(([a], [b]) => a.localeCompare(b));
if (process.argv.includes("--list")) {
  for (const [k, v] of requests) {
    const id = k.slice("CHANGE-REQUEST-".length);
    const r = all[`CHANGE-REPLY-${id}`];
    console.log(`${id} | ${v.text}\n   -> ${r ? `${r.status} · ${r.updates?.length || 0} update(s)` : "no reply yet"}`);
  }
  process.exit(0);
}
const id = arg("id");
if (!requests.some(([k]) => k === `CHANGE-REQUEST-${id}`)) { console.error(`No request ${id}. Use --list.`); process.exit(1); }
const old = all[`CHANGE-REPLY-${id}`] || { updates: [] };
const status = arg("status") || old.status || "Received";
const text = arg("update");
const reply = { status, updates: [...(old.updates || []), ...(text ? [{ at: new Date().toISOString(), text: text.slice(0, 3000) }] : [])].slice(-30) };
const res = await fetch(`${URL_}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-REPLY-${id}`, patch: reply }) });
console.log(res.ok ? `Replied to ${id}: ${status}${text ? ` + update` : ""}` : `Failed: HTTP ${res.status}`);
