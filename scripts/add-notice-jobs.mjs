// Notice jobs we don't have on file (owner, 6 Nov: "I don't see the work order number, the address, everything is
// missing"). Gafur's missing-documents lists name old jobs (2022-2025) that aren't in COA_Fetcher_2026 or
// COA_older, so the board showed no address and the map couldn't show them. Every job named in a vendor-tracking
// notice or list (from the encrypted email threads) that's missing gets its public record from NYC Open Data
// (address, borough, award, work, map point) added to public/data/COA_older.json. Run it before
// update-hpd-job-status.mjs so HPD's closing reason is picked up for them too.
//
//   node scripts/add-notice-jobs.mjs          (needs HPD_PRIVATE_DATA_KEY, or data/private/HPD_PRIVATE_DATA_KEY.txt)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const OPEN_DATA = "https://data.cityofnewyork.us/resource/mdbu-nrqn.json";
const OLDER = path.join(ROOT, "public", "data", "COA_older.json");
const NOTICE = /poor performance|performance notice|\bPPN\b|missing (required )?documents?/i;
const BORO = { 1: "Manhattan", 2: "Bronx", 3: "Brooklyn", 4: "Queens", 5: "Staten Island" };

function key() {
  const file = path.join(ROOT, "data", "private", "HPD_PRIVATE_DATA_KEY.txt");
  return (process.env.HPD_PRIVATE_DATA_KEY || (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")).trim();
}
export function decrypt(blob, keyB64) {
  const k = Buffer.from(keyB64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", k, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]);
}
// Jobs named in notices and missing-documents lists.
export function noticeOmos(threads) {
  const out = new Set();
  for (const t of threads || []) if (NOTICE.test(t.subject || "")) for (const o of t.omos || []) out.add(String(o).toUpperCase());
  return [...out];
}
const md = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : ""; };
// An Open Data row as a COA_older record (public facts only: no tenant, no phone).
export function recordOf(r) {
  const lat = Number(r.latitude), lng = Number(r.longitude);
  return {
    OMO: String(r.omonumber).toUpperCase(), COAFile: "", ITBFile: "",
    BuildingAddress: `${r.housenumber || ""} ${r.streetname || ""}${r.zip ? `, ${r.zip}` : ""}`.trim(),
    Location: "", ApartmentUnit: "", WorkStartDate: "", WorkCompletionDate: "",
    AwardDate: md(r.omoawarddate), AwardAmount: r.omoawardamount ? Number(r.omoawardamount).toFixed(2) : "", AwardedBy: "", TotalSqFt: "",
    JobDescription: String(r.omodescription || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase(),
    Source: "notice (NYC Open Data)",
    Geocode: Number.isFinite(lat) && Number.isFinite(lng) ? "OK" : "", Latitude: Number.isFinite(lat) ? lat : "", Longitude: Number.isFinite(lng) ? lng : "",
    Borough: r.boro || BORO[r.boro_id] || "",
  };
}

// Not in Open Data: the address from vendor tracking's own email ("EP04029 - 1237 Dean Street, BK", "close out OMO
// EP04029 - 1237 Dean Street"), the building only (no apartment).
const BORO_WORD = { BK: "Brooklyn", BX: "Bronx", QN: "Queens", SI: "Staten Island", MN: "Manhattan", BROOKLYN: "Brooklyn", BRONX: "Bronx", QUEENS: "Queens", MANHATTAN: "Manhattan" };
export function addressFromEmails(omo, threads) {
  const re = new RegExp(`${omo}\\s*[-–:]\\s*(\\d[\\w-]*\\s+[A-Za-z0-9 .']{3,40}?(?:Street|St|Avenue|Ave|Place|Pl|Road|Rd|Boulevard|Blvd|Parkway|Pkwy|Drive|Dr|Court|Ct|Terrace|Lane|Concourse|Way)\\b)\\.?(?:\\s*[,-]?\\s*(BK|BX|QN|SI|MN|Brooklyn|Bronx|Queens|Manhattan)\\b)?`, "i");
  for (const t of threads || []) for (const m of t.messages || []) {
    if (!m.hpd) continue;
    const x = re.exec(m.text || "");
    if (x) return { street: x[1].replace(/\s+/g, " ").trim().toUpperCase(), borough: BORO_WORD[String(x[2] || "").toUpperCase()] || "" };
  }
  return null;
}
async function geocode(text) {
  try {
    const r = await fetch(`https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(text)}`, { headers: { "User-Agent": "hpd-bid-dashboard" } });
    const f = (await r.json()).features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { lat, lng, borough: f.properties?.borough || "", zip: f.properties?.postalcode || "" };
  } catch { return null; }
}

async function openData(omos) {
  const rows = [];
  for (let i = 0; i < omos.length; i += 100) {
    const ids = omos.slice(i, i + 100).map((o) => `'${o}'`).join(",");
    const params = new URLSearchParams({ $where: `omonumber in(${ids})`, $limit: "1000" });
    let res;
    for (let tryNo = 0; tryNo < 4; tryNo++) {
      res = await fetch(`${OPEN_DATA}?${params}`, { headers: { Accept: "application/json", "User-Agent": "hpd-bid-dashboard" } }).catch(() => null);
      if (res?.ok) break;
      await new Promise((r) => setTimeout(r, 3000 * (tryNo + 1)));
    }
    if (!res?.ok) throw new Error(`NYC Open Data answered ${res?.status || "no connection"}`);
    rows.push(...(await res.json()));
  }
  return rows;
}

async function main() {
  const k = key();
  if (!k) { console.log("Notice jobs: no HPD_PRIVATE_DATA_KEY, skipped"); return; }
  const enc = path.join(ROOT, "public", "private", "conversations.json.enc");
  const threads = JSON.parse(decrypt(fs.readFileSync(enc), k).toString("utf8")).threads || [];
  const older = JSON.parse(fs.readFileSync(OLDER, "utf8"));
  const coa = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "COA_Fetcher_2026.json"), "utf8"));
  const have = new Set([...coa, ...older].map((j) => String(j.OMO || "").toUpperCase()));
  const missing = noticeOmos(threads).filter((o) => /^[A-Z]{2}\d{5}$/.test(o) && !have.has(o));
  if (!missing.length) { console.log("Notice jobs: all on file"); return; }
  const found = (await openData(missing)).map(recordOf);
  let none = missing.filter((o) => !found.some((f) => f.OMO === o));
  for (const omo of none) {
    const a = addressFromEmails(omo, threads);
    if (!a) continue;
    const g = await geocode(`${a.street}${a.borough ? `, ${a.borough}` : ""}, NY`);
    found.push({ ...recordOf({ omonumber: omo, housenumber: "", streetname: a.street, zip: g?.zip || "", boro: a.borough || g?.borough || "", latitude: g?.lat, longitude: g?.lng }), Source: "notice (vendor tracking email)" });
  }
  if (found.length) fs.writeFileSync(OLDER, JSON.stringify([...older, ...found]));
  none = missing.filter((o) => !found.some((f) => f.OMO === o));
  console.log(`Notice jobs: ${found.length} added${none.length ? `; no address found for ${none.join(", ")}` : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Notice jobs not added: ${error.message}`); process.exit(0); });
}
