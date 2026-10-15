// HPD's own status for each of your jobs, from NYC Open Data "Open Market Order (OMO) Charges":
// omostatusreason is the reason HPD closed the work order ("No Access", "OMO Completed", "Owner Refused
// Access", "Landlord Complied", ...); blank means HPD still has it open. Used by the job card, the map's
// follow-up filter and the daily follow-up report, so jobs closed at HPD but never updated in the app,
// and jobs still open and overdue, are easy to find. Writes data/ and public/data/hpd_job_status.json.
//
//   node scripts/update-hpd-job-status.mjs        (nightly, with the fetcher)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const OUT = [path.join(ROOT, "data", "hpd_job_status.json"), path.join(ROOT, "public", "data", "hpd_job_status.json")];
const OPEN_DATA = "https://data.cityofnewyork.us/resource/mdbu-nrqn.json";

export function statusRows(rows) {
  const jobs = {};
  for (const r of rows) {
    const omo = String(r.omonumber || "").toUpperCase();
    if (!omo) continue;
    jobs[omo] = { closedReason: String(r.omostatusreason || "").trim(), amount: Number(r.omoawardamount) || 0 };
  }
  return jobs;
}

async function main() {
  const coa = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "COA_Fetcher_2026.json"), "utf8"));
  // Older jobs too (2021-2025, public/data/COA_older.json): their rejections are corrected from the
  // notices, and HPD's closing reason tells what happened (work done, no access, ...).
  const olderFile = path.join(ROOT, "public", "data", "COA_older.json");
  const older = fs.existsSync(olderFile) ? JSON.parse(fs.readFileSync(olderFile, "utf8")) : [];
  const olderRows = Array.isArray(older) ? older : older.jobs || [];
  const omos = [...new Set([...coa, ...olderRows].map((j) => String(j.OMO || "").toUpperCase()).filter((o) => /^[A-Z]{2}\d{5}$/.test(o)))];
  const rows = [];
  for (let i = 0; i < omos.length; i += 150) {
    const ids = omos.slice(i, i + 150).map((o) => `'${o}'`).join(",");
    const params = new URLSearchParams({ $select: "omonumber,omostatusreason,omoawardamount", $where: `omonumber in(${ids})`, $limit: "1000" });
    const res = await fetch(`${OPEN_DATA}?${params}`, { headers: { Accept: "application/json", "User-Agent": "hpd-bid-dashboard" } });
    if (!res.ok) throw new Error(`NYC Open Data answered ${res.status}`);
    rows.push(...(await res.json()));
  }
  const jobs = statusRows(rows);
  const result = { generatedAt: new Date().toISOString(), source: "NYC Open Data: Open Market Order (OMO) Charges (omostatusreason)", jobs };
  for (const file of OUT) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(result)); }
  const open = Object.values(jobs).filter((j) => !j.closedReason).length;
  console.log(`HPD job status: ${Object.keys(jobs).length} of ${omos.length} jobs found, ${open} still open at HPD, ${Object.keys(jobs).length - open} closed`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`HPD job status not updated: ${error.message}`); process.exit(1); });
}
