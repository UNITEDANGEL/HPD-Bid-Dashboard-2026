// 🏢 Building history: same building in different spellings, the job itself left out, newest first, one line summary.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { buildingKey, buildingHistory, historyLine, dateOf } = await loadLib("building-history");
const { workInWords } = await loadLib("next-stop");
assert.equal(buildingKey("1020 Boynton Ave., 10472"), buildingKey("1020 BOYNTON AVENUE"));
assert.equal(buildingKey("34-15 Parsons Blvd"), "34-15 PARSONS BOULEVARD");
assert.equal(buildingKey("12 W 125th St"), "12 WEST 125 STREET");
assert.notEqual(buildingKey("1020 BOYNTON AVENUE"), buildingKey("1022 BOYNTON AVENUE"));
assert.equal(dateOf("04/16/24"), Date.UTC(2024, 3, 16));
const me = { OMO: "ER02330", BuildingAddress: "1020 BOYNTON AVENUE, 10472" };
const pools = [
  [me, { OMO: "EO11111", BuildingAddress: "1020 Boynton Ave", AwardDate: "05/01/25", AwardAmount: "1,200", ApartmentUnit: "3B", JobDescription: "REPLACE ENTRANCE DOOR - more", HpdClosedReason: "No Access", Paid: "not paid yet" }],
  [{ OMO: "EN22222", BuildingAddress: "1020 BOYNTON AVENUE, 10472", AwardDate: "01/10/24", AwardAmount: "800", JobDescription: "Plaster repair", HpdClosedReason: "OMO Completed", Paid: "paid" },
   { OMO: "EO11111", BuildingAddress: "1020 BOYNTON AVENUE", AwardDate: "05/01/25" },
   { OMO: "EX99999", BuildingAddress: "1022 BOYNTON AVENUE" }],
];
const h = buildingHistory(me, pools, workInWords);
assert.deepEqual(h.map((x) => x.omo), ["EO11111", "EN22222"]);
assert.equal(h[0].amount, 1200); assert.equal(h[0].unit, "3B"); assert.equal(h[0].work, "replace entrance door");
assert.equal(h[0].ended, "HPD: No Access · not paid yet"); assert.equal(h[1].ended, "HPD: OMO Completed · paid");
assert.equal(historyLine(h), "2 other jobs here, last May 2025 · 1 no access");
assert.deepEqual(buildingHistory({ OMO: "X", BuildingAddress: "" }, pools, workInWords), []);
console.log("building-history ok");
