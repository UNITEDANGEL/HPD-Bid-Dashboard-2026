// What broke on the owner's phones (lib/app-errors -> APP-ERRORS-<phone> on the status server), newest first.
// Read it at the start of every upgrade session and fix what's there.
//     node scripts/app-errors.mjs            (last 7 days)
//     node scripts/app-errors.mjs --days 30
import fs from "node:fs";

const URL_ = /HPD_STATUS_WORKER_URL = "([^"]+)"/.exec(fs.readFileSync(new URL("../lib/paperwork.ts", import.meta.url), "utf8"))[1];
const i = process.argv.indexOf("--days");
const days = i > 0 ? Number(process.argv[i + 1]) || 7 : 7;
const all = (await (await fetch(`${URL_}/overrides`, { cache: "no-store" })).json()).overrides || {};
const since = Date.now() - days * 86400000;
const rows = Object.entries(all).filter(([k]) => k.startsWith("APP-ERRORS-"))
  .flatMap(([k, v]) => (Array.isArray(v?.errors) ? v.errors : []).map((e) => ({ ...e, phone: `${k.slice(11)} · ${v.device || "?"} · v${v.version || "?"}` })))
  .filter((e) => Date.parse(e.at) >= since)
  .sort((a, b) => b.at.localeCompare(a.at));
const voice = all["VOICE-CHECK"];
if (voice) console.log(`Voice (${voice.at}): ${voice.browser}${voice.homeScreen ? " Home Screen" : ""} · listen ${voice.canListen} · speak ${voice.canSpeak} · answers off ${voice.spokenAnswersOff} · ${voice.what}`);
if (!rows.length) { console.log(`No app errors in the last ${days} days.`); process.exit(0); }
for (const e of rows) console.log(`${e.at} ${e.kind}${e.n > 1 ? ` ×${e.n}` : ""} ${e.page} [${e.phone}]\n   ${e.msg}${e.where ? `\n   at ${e.where}` : ""}`);
