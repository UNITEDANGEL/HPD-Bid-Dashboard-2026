// Building facts on a bid: PLUTO (year, floors, apartments, walk-up / elevator), open HPD violations by
// class, and the open violations that match the bid's work. All requests answered here (no internet).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { loadBuildingFacts, workWords, bidApartment, plainViolation, relatedViolations, buildingKind } = await loadLib("building-facts");

assert.deepEqual(workWords("PROPERLY REPLACE THE DEFECTIVE FIRE RATED GLASS AT BUILDING ENTRANCE DOOR, 1ST FLOOR, EAST WALL"), ["DOOR", "GLASS"]);
assert.deepEqual(workWords("PATCH AND PAINT THE WALL AT 2ND FLOOR"), ["WALL", "FLOOR", "PAINT"], "generic words only when nothing specific");
assert.equal(bidApartment("SPRING BALANCE AT LOWER SASH WINDOW LOCATED AT APT 1, 1 STORY"), "1");
assert.equal(bidApartment("(APT B1 VACANT) TOTAL WINDOWS = 1"), "B1");
assert.equal(bidApartment("PUBLIC HALL 1ST STORY"), "");
assert.equal(plainViolation("§ 27-2005, 27-2007, 27-2041.1 HMC, §238, § 309; § 107 (2) ( C) MDL AND 28 RCNY §25-171: REPLACE OR REPAIR THE SELF-CLOSING DOORS"), "REPLACE OR REPAIR THE SELF-CLOSING DOORS");
assert.equal(plainViolation("§ 27-2005 ADM CODE PROPERLY REPAIR WITH SIMILAR MATERIAL THE BROKEN TILES"), "PROPERLY REPAIR WITH SIMILAR MATERIAL THE BROKEN TILES");
assert.equal(plainViolation("§ 27-2044, 2041.1 HMC: §238 MDL and 28 RCNY §25-171: REPLACE OR REPAIR THE SELF-CLOSING DOORS"), "REPLACE OR REPAIR THE SELF-CLOSING DOORS");
assert.equal(buildingKind("C7"), "walk-up");
assert.equal(buildingKind("D1"), "elevator building");

const rows = [
  { class: "B", apartment: "", inspectiondate: "2026-09-01T00:00:00.000", novdescription: "§ 27-2005 HMC: REPAIR THE BROKEN DOOR CLOSER AT PUBLIC HALL" },
  { class: "C", apartment: "", inspectiondate: "2026-08-28T00:00:00.000", novdescription: "§ 27-2005 HMC: REPLACE THE CRACKED GLASS AT BUILDING ENTRANCE DOOR" },
  { class: "C", apartment: "1", inspectiondate: "2024-05-01T00:00:00.000", novdescription: "§ 27-2056.7 ADM CODE -CERTIFY COMPLIANCE WITH LEAD-BASED PAINT HAZARD CONTROL (WINDOWS, DOORS)" },
  { class: "A", apartment: "1", inspectiondate: "2025-01-01T00:00:00.000", novdescription: "§ 27-2005 HMC: REPAIR THE DOOR STOP IN APT 1" },
  { class: "C", apartment: "", inspectiondate: "2026-10-01T00:00:00.000", novdescription: "§ 27-2017.4 HMC: ABATE THE INFESTATION OF MICE" },
];
// Same apartment first, then class C, then B; lead-paint paperwork and unrelated violations left out.
const rel = relatedViolations(rows, "REPLACE THE DOOR GLASS AT APT 1");
assert.deepEqual(rel.map((r) => `${r.cls}${r.apt}`), ["A1", "C", "B"]);
assert.equal(rel[1].text, "REPLACE THE CRACKED GLASS AT BUILDING ENTRANCE DOOR");
assert.equal(rel[1].day, "8/28/26");
assert.deepEqual(relatedViolations(rows, "NO KNOWN WORK HERE"), []);

// The violation that reads like the bid comes first (ER07035: 4th window from east at south, building front).
const win = relatedViolations([
  { class: "C", apartment: "B2", inspectiondate: "2026-08-12T00:00:00.000", novdescription: "§ 27-2043.1 HMC INSTALL THE MISSING OR REPAIR/REPLACE THE DEFECTIVE WINDOW GUARD(S)" },
  { class: "C", apartment: "", inspectiondate: "2026-08-12T00:00:00.000", novdescription: "§ 27-2005 HMC: PROPERLY REPAIR OR REPLACE THE BROKEN OR DEFECTIVE LOWER WINDOW SASH GLASS PANE AT 1ST STY, 4TH WINDOW FROM EAST AT SOUTH. BUILDING FRONT" },
], "REPLACE 4TH WINDOW FROM EAST AT SOUTH AT BUILDING FRONT (APT B1 VACANT) TOTAL WINDOWS = 1");
assert.match(win[0].text, /4TH WINDOW FROM EAST AT SOUTH/);

// The whole lookup: GeoSearch -> PLUTO + HPD violations (by BIN).
const urls = [];
const fake = async (url) => {
  urls.push(url);
  const json = url.includes("geosearch") ? { features: [{ properties: { addendum: { pad: { bbl: "1019660042", bin: "1059533" } } } }] }
    : url.includes("64uk-42ks") ? [{ yearbuilt: "1901", numfloors: "6.0000000", unitsres: "16", bldgclass: "C7" }]
    : url.includes("count") ? [{ class: "A", count: "35" }, { class: "B", count: "80" }, { class: "C", count: "13" }, { class: "I", count: "1" }]
    : rows.map((r) => ({ ...r, buildingid: "39531" }));
  return { ok: true, json: async () => json };
};
const f = await loadBuildingFacts("457 WEST 125 STREET", "MN", "REPLACE THE ENTRANCE DOOR GLASS", fake);
assert.equal(f.yearBuilt, 1901); assert.equal(f.floors, 6); assert.equal(f.units, 16); assert.equal(f.kind, "walk-up");
assert.deepEqual(f.open, { A: 35, B: 80, C: 13, total: 128 }, "class I orders aren't counted");
assert.equal(f.hpdBuildingId, "39531");
assert.equal(f.related[0].cls, "C");
assert.match(urls[0], /457%20WEST%20125%20STREET%2C%20Manhattan%2C%20NY/);
assert.ok(urls.slice(1).every((u) => !u.includes("wvxf") || decodeURIComponent(u).includes("bin='1059533' AND violationstatus='Open'")));
// A "million" placeholder BIN: look up by the lot (BBL) instead.
const fake2 = async (url) => (url.includes("geosearch") ? { ok: true, json: async () => ({ features: [{ properties: { addendum: { pad: { bbl: "3012340001", bin: "3000000" } } } }] }) } : (urls.push(url), { ok: true, json: async () => [] }));
urls.length = 0;
const g = await loadBuildingFacts("1 NOWHERE ST", "BK", "DOOR", fake2);
assert.ok(decodeURIComponent(urls.find((u) => u.includes("wvxf"))).includes("bbl='3012340001'"));
assert.equal(g.open.total, 0);
// Address not found: no facts (the bid still works).
assert.equal(await loadBuildingFacts("X", "BK", "", async () => ({ ok: true, json: async () => ({ features: [] }) })), null);
await assert.rejects(loadBuildingFacts("X", "BK", "", async () => ({ ok: false, status: 503, json: async () => ({}) })));
console.log("PASS building facts: year / floors / apartments / walk-up, open HPD violations by class, matching violations (same apartment, class C first), BIN or BBL");
