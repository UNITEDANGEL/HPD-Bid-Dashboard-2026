// The owner's "Ask for a change" requests from the app (status server keys CHANGE-REQUEST-<time>), oldest first.
//     node scripts/list-change-requests.mjs
import fs from "node:fs";
const HPD_STATUS_WORKER_URL = /HPD_STATUS_WORKER_URL = "([^"]+)"/.exec(fs.readFileSync(new URL("../lib/paperwork.ts", import.meta.url), "utf8"))[1];

const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/overrides`, { cache: "no-store" });
const data = await r.json();
const rows = Object.entries(data.overrides || {}).filter(([k]) => k.startsWith("CHANGE-REQUEST-")).map(([, v]) => v).sort((a, b) => String(a.at).localeCompare(String(b.at)));
if (!rows.length) console.log("No change requests from the app.");
for (const v of rows) console.log(`${v.at} (version ${v.version || "?"}): ${v.text}`);
