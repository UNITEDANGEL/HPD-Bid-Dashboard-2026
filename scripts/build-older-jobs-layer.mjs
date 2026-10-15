// Older jobs layer (2024-2025): every OMO awarded to you in those years, with HPD's public details
// (NYC Open Data "Open Market Order (OMO) Charges": address, apartment, borough, description, award date
// and amount, HPD's closing reason, map location) and PIP's paid / not paid. Your OMOs come from PIP
// (public/data/pip_paid.json) and the older-jobs file; no PDFs, no map lookups.
//   node scripts/build-older-jobs-layer.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const read = (p, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return fallback; } };
const pip = read("public/data/pip_paid.json", { jobs: {} }).jobs;
const current = new Set(read("public/data/COA_Fetcher_2026.json", []).map((j) => String(j.OMO).toUpperCase()));
const mine = [...new Set([...Object.keys(pip), ...read("public/data/COA_older.json", []).map((j) => j.OMO)])].filter((o) => !current.has(o));

const rows = [];
for (let i = 0; i < mine.length; i += 150) {
  const list = mine.slice(i, i + 150).map((o) => `'${o}'`).join(",");
  const url = `https://data.cityofnewyork.us/resource/mdbu-nrqn.json?$limit=1000&$where=${encodeURIComponent(`omonumber in (${list}) AND omoawarddate >= '2024-01-01' AND omoawarddate < '2026-01-01'`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Data HTTP ${res.status}`);
  rows.push(...(await res.json()));
}
const mdy = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}` : "");
const jobs = rows.map((r) => {
  const p = pip[r.omonumber] || null;
  return {
    OMO: r.omonumber, BuildingAddress: `${r.housenumber || ""} ${r.streetname || ""}${r.zip ? `, ${r.zip}` : ""}`.trim(),
    ApartmentUnit: r.apartment || "", Borough: r.boro || "", AwardDate: mdy(r.omoawarddate), AwardAmount: r.omoawardamount || "",
    JobDescription: (r.omodescription || "").toUpperCase(), HpdClosedReason: r.omostatusreason || "",
    Latitude: r.latitude ? Number(r.latitude) : null, Longitude: r.longitude ? Number(r.longitude) : null,
    Paid: p ? p.status : "", PaidAmount: p ? p.paid : 0, Source: "2024-2025 (HPD Open Data + PIP)",
  };
}).sort((a, b) => a.OMO.localeCompare(b.OMO));
fs.writeFileSync(path.join(ROOT, "public", "data", "jobs_2024_2025.json"), JSON.stringify({ generatedAt: new Date().toISOString(), jobs }));
const by = (k) => jobs.reduce((a, j) => ((a[j[k] || "(none)"] = (a[j[k] || "(none)"] || 0) + 1), a), {});
console.log(`2024-2025 jobs: ${jobs.length} (from ${mine.length} of your OMOs); on the map ${jobs.filter((j) => j.Latitude).length}`);
console.log("paid:", by("Paid"));
console.log("HPD closing reason:", by("HpdClosedReason"));
