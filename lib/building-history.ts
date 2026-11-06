// 🏢 Building history (idea list, 3 Nov: "every past job at this address, photos and notes, one tap from the card").
// The other jobs at the same building (2024 to now), newest first: what was done, the money, and how it ended
// (HPD's close reason, paid or not), so before you knock you know the building, the apartment and what happened last.

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

const WORDS: [RegExp, string][] = [
  [/\bAVE\b\.?/g, "AVENUE"], [/\bST\b\.?/g, "STREET"], [/\bRD\b\.?/g, "ROAD"], [/\bBLVD\b\.?/g, "BOULEVARD"],
  [/\bPL\b\.?/g, "PLACE"], [/\bPKWY\b\.?/g, "PARKWAY"], [/\bDR\b\.?/g, "DRIVE"], [/\bE\b\.?/g, "EAST"], [/\bW\b\.?/g, "WEST"],
  [/\b(\d+)(ST|ND|RD|TH)\b/g, "$1"],
];
// "1020 Boynton Ave., 10472" and "1020 BOYNTON AVENUE" are the same building.
export function buildingKey(address: string) {
  let a = str(address).toUpperCase().replace(/,.*$/, "").replace(/[.#]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, to] of WORDS) a = a.replace(re, to);
  return a.replace(/\s+/g, " ").trim();
}

// "04/16/24", "2026-03-02", "2026-03-02T..." -> a time for sorting (0 if unknown).
export function dateOf(v: unknown) {
  const s = str(v).trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (us) { const y = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]); return Date.UTC(y, Number(us[1]) - 1, Number(us[2])); }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

export type PastJob = { omo: string; at: number; unit: string; work: string; amount: number; ended: string };

function endedOf(r: Row) {
  const closed = str(r.HpdClosedReason);
  const paid = str(r.Paid);
  const outcome = str(r.FieldOutcome).replace(/_/g, " ").toLowerCase();
  return [closed && `HPD: ${closed}`, outcome && !closed ? outcome : "", paid && paid !== "not paid yet" ? paid : paid ? "not paid yet" : ""].filter(Boolean).join(" · ");
}

export function buildingHistory(job: Row, pools: Row[][], workInWords: (t: string) => string): PastJob[] {
  const key = buildingKey(str(job.BuildingAddress || job.Address));
  const me = str(job.OMO).toUpperCase();
  if (!key || !/^\d/.test(key)) return [];
  const seen = new Map<string, PastJob>();
  for (const pool of pools) for (const r of pool) {
    const omo = str(r.OMO).toUpperCase();
    if (!omo || omo === me || buildingKey(str(r.BuildingAddress || r.Address)) !== key) continue;
    const row: PastJob = { omo, at: dateOf(r.AwardDate || r.WorkStartDate), unit: str(r.ApartmentUnit).trim(), work: workInWords(str(r.JobDescription || r.Job_Description)), amount: Number(str(r.AwardAmount).replace(/[$,]/g, "")) || 0, ended: endedOf(r) };
    const cur = seen.get(omo);
    // The same job in two files: keep the one that says more.
    if (!cur || (row.ended.length + row.work.length) > (cur.ended.length + cur.work.length)) seen.set(omo, row);
  }
  return [...seen.values()].sort((a, b) => b.at - a.at);
}

export function historyLine(list: PastJob[]) {
  if (!list.length) return "";
  const noAccess = list.filter((x) => /no access|refused/i.test(x.ended)).length;
  const last = list[0];
  const when = last.at ? new Date(last.at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" }) : "";
  return `${list.length} other job${list.length === 1 ? "" : "s"} here${when ? `, last ${when}` : ""}${noAccess ? ` · ${noAccess} no access` : ""}`;
}
