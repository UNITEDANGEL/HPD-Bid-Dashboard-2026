// Put saved data back on the status server from the master file, if the server ever loses it.
// Reads the master file (a readable copy from your OneDrive with --file, or the encrypted one in the
// repository with MASTER_FILE_KEY), compares every saved entry with what the server has now, and lists
// what's missing there or older there. Nothing is sent unless --apply is given, and nothing is ever
// deleted: only entries missing on the server, or older on the server, are put back.
//
//   node scripts/restore-from-master.mjs [--file ".../master-2026-10-13.json"]           (shows what it would do)
//   node scripts/restore-from-master.mjs [--file ...] --apply                            (puts them back)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt, fetchOverrides } from "./build-master-file.mjs";

const WORKER = (process.env.HPD_STATUS_WORKER_URL || "https://hpd-status-worker.uac525.workers.dev").replace(/\/$/, "");

// What to put back: entries missing on the server, or whose server copy is older (by updatedAt).
export function restorePlan(saved, current) {
  const plan = [];
  for (const [key, value] of Object.entries(saved || {})) {
    if (!value || typeof value !== "object") continue;
    const now = current?.[key];
    if (!now) plan.push({ key, why: "missing on the server", value });
    else if (String(value.updatedAt || "") > String(now.updatedAt || "")) plan.push({ key, why: `server copy older (${now.updatedAt || "no date"} < ${value.updatedAt})`, value });
  }
  return plan;
}

async function main() {
  const fileArg = process.argv.indexOf("--file");
  const apply = process.argv.includes("--apply");
  let master;
  if (fileArg > 0) master = JSON.parse(fs.readFileSync(process.argv[fileArg + 1], "utf8"));
  else {
    const key = process.env.MASTER_FILE_KEY;
    if (!key) throw new Error("Give --file (a readable master file) or set MASTER_FILE_KEY for the encrypted one.");
    master = JSON.parse(decrypt(fs.readFileSync(path.join(process.cwd(), "data", "master", "master-file.json.enc"), "utf8"), key));
  }
  const saved = master.statusServerData || {};
  const got = await fetchOverrides();
  if (!got.ok) throw new Error(`The status server isn't answering (${got.error}); try again later.`);
  const plan = restorePlan(saved, got.overrides);
  console.log(`Master file from ${master.generatedAt}: ${Object.keys(saved).length} saved entries; server has ${Object.keys(got.overrides).length}.`);
  for (const p of plan.slice(0, 50)) console.log(`  ${p.key}: ${p.why}`);
  if (plan.length > 50) console.log(`  ... and ${plan.length - 50} more`);
  if (!plan.length) { console.log("Nothing to put back: the server has everything."); return; }
  if (!apply) { console.log(`${plan.length} entries would be put back. Run again with --apply to do it.`); return; }
  let done = 0;
  for (const p of plan) {
    const r = await fetch(`${WORKER}/override`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "hpd-master-restore" }, body: JSON.stringify({ key: p.key, patch: p.value }) });
    if (r.ok) done++;
    else console.log(`  ${p.key}: not restored (HTTP ${r.status})`);
  }
  console.log(`Put back ${done} of ${plan.length} entries.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Restore stopped: ${error.message}`); process.exit(1); });
}
