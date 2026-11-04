// Weekly app check-up (idea "Weekly app check-up"): once a week it opens the live app's main pages, counts the errors
// the owner's phones sent in the last 7 days (APP-ERRORS-<phone>, same source as app-errors.mjs), and keeps a short
// plain result as WEEKLY-CHECKUP on the status server. Counts and messages only: no phone numbers, emails or names.
//     node scripts/weekly-checkup.mjs            (check, print, save to the status server)
//     node scripts/weekly-checkup.mjs --dry      (check and print only)
import fs from "node:fs";

const URL_ = /HPD_STATUS_WORKER_URL = "([^"]+)"/.exec(fs.readFileSync(new URL("../lib/paperwork.ts", import.meta.url), "utf8"))[1];
const SITE = process.env.CHECKUP_SITE || "https://hpd-bid-dashboard-2026.pages.dev";
const PAGES = ["/map/", "/data/whats-new.json", "/data/upgrade-ideas.json", "/data/bid_win_stats.json"];
const dry = process.argv.includes("--dry");

const clean = (s) => String(s || "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "(email)").replace(/\+?\d[\d\s().-]{8,}\d/g, "(number)").slice(0, 140);

export async function runCheckup(fetchFn = fetch) {
  const slow = [], broken = [];
  for (const p of PAGES) {
    const t0 = Date.now();
    try {
      const r = await fetchFn(SITE + p, { cache: "no-store" });
      if (!r.ok) broken.push(`${p} (${r.status})`);
      else if (Date.now() - t0 > 4000) slow.push(`${p} (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch { broken.push(`${p} (no answer)`); }
  }
  const all = (await (await fetchFn(`${URL_}/overrides`, { cache: "no-store" })).json()).overrides || {};
  const since = Date.now() - 7 * 86400000;
  const groups = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith("APP-ERRORS-") || !Array.isArray(v?.errors)) continue;
    for (const e of v.errors) {
      if (!(Date.parse(e.at) >= since)) continue;
      const key = `${e.kind}: ${clean(e.msg)}`;
      groups.set(key, (groups.get(key) || 0) + (e.n || 1));
    }
  }
  const errors = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([what, n]) => ({ what, n }));
  const errorCount = [...groups.values()].reduce((a, b) => a + b, 0);
  const ok = !broken.length && !errorCount;
  const line = ok ? "All good: every page opens and no errors came from your phone this week."
    : `${broken.length ? `${broken.length} page(s) not opening. ` : ""}${errorCount ? `${errorCount} error(s) from your phone this week.` : ""}`.trim();
  return { at: new Date().toISOString(), ok, line, broken, slow, errorCount, errors };
}

if (process.argv[1] && process.argv[1].endsWith("weekly-checkup.mjs")) {
  const res = await runCheckup();
  console.log(res.line);
  for (const b of res.broken) console.log(`  not opening: ${b}`);
  for (const s of res.slow) console.log(`  slow: ${s}`);
  for (const e of res.errors) console.log(`  ×${e.n} ${e.what}`);
  if (!dry) await fetch(`${URL_}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "WEEKLY-CHECKUP", patch: res }) });
}
