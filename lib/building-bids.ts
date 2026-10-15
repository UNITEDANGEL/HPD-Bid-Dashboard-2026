// Earlier HPD jobs at the same building as an invitation: what HPD paid (the winning price), whether you
// won, the kind of work, and your own price when the app has it (bids sent from the app). Shown next to
// the price box so a re-invitation at a building isn't priced blind.

import { workKey, workLabel, type MarketJob } from "./bid-stats";

const BORO: Record<string, string> = { MN: "MANHATTAN", BK: "BROOKLYN", QN: "QUEENS", BX: "BRONX", SI: "STATEN ISLAND" };
const WORDS: [RegExp, string][] = [
  [/\bAVE\b/g, "AVENUE"], [/\bST\b/g, "STREET"], [/\bPL\b/g, "PLACE"], [/\bBLVD\b/g, "BOULEVARD"], [/\bRD\b/g, "ROAD"],
  [/\bPKWY\b/g, "PARKWAY"], [/\bDR\b/g, "DRIVE"], [/\bTER\b/g, "TERRACE"], [/\bCT\b/g, "COURT"], [/\bE\b/g, "EAST"], [/\bW\b/g, "WEST"],
  [/\b(\d+)(ST|ND|RD|TH)\b/g, "$1"],
];

export function sameAddressKey(address: string) {
  let a = String(address || "").toUpperCase().replace(/[^A-Z0-9 -]/g, " ");
  for (const [re, to] of WORDS) a = a.replace(re, to);
  return a.replace(/\s+/g, " ").trim();
}

const boroName = (b: string) => BORO[String(b || "").toUpperCase()] || String(b || "").toUpperCase();

export type BuildingJob = { omo: string; awardDate: string; paid: number; won: boolean; work: string; sameWork: boolean; yours: number | null };

export function buildingHistory(
  bid: { omo: string; address: string; borough: string; description: string },
  market: MarketJob[],
  yourPrices: Record<string, number> = {},
): BuildingJob[] {
  const key = sameAddressKey(bid.address);
  const boro = boroName(bid.borough);
  const work = workKey(bid.description || "");
  return market
    .filter((j) => j.omo !== bid.omo && sameAddressKey(j.address || "") === key && (!j.boro || !boro || boroName(j.boro) === boro))
    .map((j) => {
      const w = workKey(j.description || "");
      return { omo: j.omo, awardDate: j.awardDate, paid: j.amount, won: j.won, work: workLabel(j.description || ""), sameWork: !!w && w === work, yours: yourPrices[j.omo] ?? null };
    })
    .sort((a, b) => Number(b.sameWork) - Number(a.sameWork) || b.awardDate.localeCompare(a.awardDate));
}
