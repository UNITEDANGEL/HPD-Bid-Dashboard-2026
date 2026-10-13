// What HPD paid, whoever won: every invitation you received (full description, from
// data/market_descriptions.json plus tonight's open invitations) joined with its award amount from NYC
// Open Data "Open Market Order (OMO) Charges" (the data HPD Online shows). HPD awards the low bid, so
// the award is the price it took to win. Writes public/data/market_awards.json for the price help and
// for "Lost: won at $X" in My bids. The contractor who won is not published, only the price.
//
//   node scripts/update-market-awards.mjs            (nightly, after the upcoming bids are read)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const DESCRIPTIONS = path.join(ROOT, "data", "market_descriptions.json");
const OUT = [path.join(ROOT, "data", "market_awards.json"), path.join(ROOT, "public", "data", "market_awards.json")];
const OPEN_DATA = "https://data.cityofnewyork.us/resource/mdbu-nrqn.json";
const SINCE = "2025-01-01";

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };

// Descriptions of tonight's invitations are kept: once their due date passes they leave the map.
export function addUpcoming(descriptions, upcoming) {
  let added = 0;
  for (const bid of upcoming?.bids || []) {
    if (!bid.omo || !bid.description || descriptions[bid.omo]?.description) continue;
    descriptions[bid.omo] = { description: String(bid.description).slice(0, 6000), source: bid.itbFile || "upcoming" };
    added++;
  }
  return added;
}

export function joinAwards(descriptions, awards, wonOmos) {
  const byOmo = new Map();
  for (const row of awards) {
    const amount = Number(row.omoawardamount);
    if (!row.omonumber || !(amount > 0)) continue;
    byOmo.set(String(row.omonumber).toUpperCase(), row);
  }
  const jobs = [];
  for (const [omo, { description }] of Object.entries(descriptions)) {
    const row = byOmo.get(omo);
    if (!row) continue;
    jobs.push({
      omo, amount: Number(row.omoawardamount), awardDate: String(row.omoawarddate || "").slice(0, 10),
      won: wonOmos.has(omo), boro: row.boro || "", zip: row.zip || "", area: row.nta || "",
      address: [row.housenumber, row.streetname].filter(Boolean).join(" "), aep: row.isaep === "True" || /\bAEP\b|ALTERNATIVE ENFORCEMENT/i.test(description),
      description,
    });
  }
  return jobs.sort((a, b) => b.awardDate.localeCompare(a.awardDate) || a.omo.localeCompare(b.omo));
}

async function fetchAwards(fetcher = fetch) {
  const params = new URLSearchParams({
    $select: "omonumber,omoawardamount,omoawarddate,boro,isaep,housenumber,streetname,zip,nta",
    $where: `omocreatedate >= '${SINCE}' AND omoawardamount > 0`,
    $limit: "500000",
  });
  const response = await fetcher(`${OPEN_DATA}?${params}`, { headers: { Accept: "application/json", "User-Agent": "hpd-bid-dashboard" } });
  if (!response.ok) throw new Error(`NYC Open Data answered ${response.status}`);
  return response.json();
}

async function main() {
  const descriptions = readJson(DESCRIPTIONS, {});
  const added = addUpcoming(descriptions, readJson(path.join(ROOT, "data", "upcoming_bids.json"), {}));
  fs.writeFileSync(DESCRIPTIONS, JSON.stringify(Object.fromEntries(Object.entries(descriptions).sort()), null, 0));
  // Yours: the job database plus every "CONFIRMATION OF AWARD" email since 2025 (data/your_awards.json,
  // scripts/fetch_award_history.py); the job database alone starts in December 2025.
  const won = new Set([
    ...readJson(path.join(ROOT, "data", "COA_Fetcher_2026.json"), []).map((j) => String(j.OMO || "").toUpperCase()),
    ...Object.keys(readJson(path.join(ROOT, "data", "your_awards.json"), {})),
  ]);
  const awards = await fetchAwards();
  const jobs = joinAwards(descriptions, awards, won);
  const result = { generatedAt: new Date().toISOString(), source: "NYC Open Data: Open Market Order (OMO) Charges", jobs };
  for (const file of OUT) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(result)); }
  console.log(`Market awards: ${jobs.length} awarded jobs with full descriptions (${jobs.filter((j) => j.won).length} yours, ${jobs.filter((j) => !j.won).length} other contractors) from ${Object.keys(descriptions).length} invitations; ${added} new descriptions kept tonight; ${awards.length} awards in Open Data since ${SINCE}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Market awards not updated: ${error.message}`); process.exit(1); });
}
