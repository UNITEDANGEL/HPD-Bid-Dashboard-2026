// Earlier jobs at the same building, next to the bid price: address matching (AVE / AVENUE, 34TH / 34,
// E / EAST), borough, same kind of work first, newest first, your own price when the app has it.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildingHistory, sameAddressKey } = await loadLib("building-bids");
assert.equal(sameAddressKey("1600 Sedgwick Ave."), sameAddressKey("1600 SEDGWICK AVENUE"));
assert.equal(sameAddressKey("139-06 34th Rd"), "139-06 34 ROAD");
assert.equal(sameAddressKey("866 E 221 ST"), "866 EAST 221 STREET");
const market = [
  { omo: "A1", amount: 640, awardDate: "2026-04-22", won: true, boro: "Bronx", address: "1600 SEDGWICK AVE", description: "REPLACE DEFECTIVE LOCK AT ENTRANCE DOOR" },
  { omo: "A2", amount: 1750, awardDate: "2026-06-25", won: false, boro: "Bronx", address: "1600 SEDGWICK AVENUE", description: "REPLACE 3 WINDOWS AT APT 4B, TOTAL WINDOWS = 3" },
  { omo: "A3", amount: 500, awardDate: "2026-05-01", won: false, boro: "Brooklyn", address: "1600 SEDGWICK AVENUE", description: "REPLACE LOCK" },
  { omo: "A4", amount: 300, awardDate: "2026-05-01", won: false, boro: "Bronx", address: "1602 SEDGWICK AVENUE", description: "REPLACE LOCK" },
  { omo: "NEW", amount: 0, awardDate: "2026-10-15", won: false, boro: "Bronx", address: "1600 SEDGWICK AVENUE", description: "REPLACE LOCK" },
];
const rows = buildingHistory({ omo: "NEW", address: "1600 Sedgwick Ave", borough: "BX", description: "SUPPLY AND INSTALL NEW LOCK AT BUILDING ENTRANCE DOOR" }, market, { A1: 610 });
assert.deepEqual(rows.map((r) => r.omo), ["A1", "A2"], "same building and borough only, not this invitation; same work first");
assert.equal(rows[0].sameWork, true);
assert.equal(rows[0].yours, 610);
assert.equal(rows[0].paid, 640);
assert.equal(rows[1].yours, null);
assert.ok(rows[0].work.length > 0);
console.log("PASS building bids: same address (AVE/AVENUE, 34TH/34, E/EAST) and borough, same work first, winning price, won or not, your price when known");
