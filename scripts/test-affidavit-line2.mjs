// 🗓 Affidavit line 2 = the Confirmation of Award date (owner, 9 Nov: "big error in all affidavits, see ER04312 ... line
// 2 date needs to be the confirmation of award date; change all"). The real case: ER04312 sent with 09/12/26 (the
// work date) on line 2; awarded 09/04/26.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { isoDay, usDay, line2Fix, line2Fixes, line2Reason, line2Href } = await loadLib("affidavit-line2");

assert.equal(isoDay("09/04/26"), "2026-09-04");
assert.equal(isoDay("9/4/2026"), "2026-09-04");
assert.equal(isoDay("2026-09-04T10:00:00Z"), "2026-09-04");
assert.equal(isoDay(""), "");
assert.equal(usDay("2026-09-04"), "09/04/26");

const er04312 = { awardDate: "2026-09-12", workStart: "2026-09-12", workComplete: "2026-09-12", outcome: "work_completed", sentAt: "2026-10-19" };
const f = line2Fix("ER04312", er04312, "09/04/26");
assert.deepEqual(f, { omo: "ER04312", sent: "2026-09-12", award: "2026-09-04", sentAt: "2026-10-19", workDate: true });
assert.equal(line2Reason(f), "Line 2 date (directed by HPD on) must be the Confirmation of Award date 09/04/26, not 09/12/26 (the work date).");
assert.match(line2Href(f, "2026-11-09"), /^\/paperwork\/\?job=ER04312&fix=2026-11-09&reason=Line%202%20date/);
// Right date, no date read, or no award known: nothing to fix.
assert.equal(line2Fix("A", { awardDate: "2026-09-04" }, "09/04/26"), null);
assert.equal(line2Fix("A", { workStart: "2026-09-12" }, "09/04/26"), null);
assert.equal(line2Fix("A", { awardDate: "2026-09-12" }, ""), null);

const all = line2Fixes({
  ER04312: er04312,
  ER00272: { awardDate: "2026-08-06", workStart: "2026-08-06", sentAt: "2026-10-26" },
  OK0001: { awardDate: "2026-01-02", sentAt: "2026-10-01" },
  FIXED1: { awardDate: "2026-05-05", sentAt: "2026-09-01" },
}, (o) => ({ ER04312: "09/04/26", ER00272: "07/08/26", OK0001: "01/02/26", FIXED1: "05/01/26" })[o] || "", { FIXED1: "2026-11-01" });
assert.deepEqual(all.map((x) => x.omo), ["ER00272", "ER04312"], "newest sent first; right ones and fixed ones left out");
console.log("affidavit line 2 ok: the sent date against the award date, the fix list newest first, HPD's reason and the fix link");
