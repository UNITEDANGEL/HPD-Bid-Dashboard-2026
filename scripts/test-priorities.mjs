// The priority list: HPD's 24-hour notices first (with deadlines), then 72-hour, rejections, missing documents,
// fixed paperwork to print; answered threads and handled items leave the list.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildPriorities, dueText } = await loadLib("priorities");
const t = (id, subject, omos, at, extra = {}) => ({ id, subject, omos, kind: extra.kind || "past due", people: [extra.who || "Joy-Ann Lewis"], lastAt: at, waiting: true, messages: [{ at, text: extra.text || "Kindly see attached", hpd: true, mine: false }, ...(extra.reply ? [{ at: extra.reply, text: "sent", hpd: false, mine: true }] : [])] });
const threads = [
  t("a", "72 HOUR PERFORMANCE NOTICE- OMO#ER01987", ["ER01987"], "2026-10-16T15:58:00Z"),
  t("b", "24 HR POOR PERFORMANCE NOTICE- OMO#EQ22426", ["EQ22426"], "2026-10-16T16:01:00Z"),
  t("c", "24 HR POOR PERFORMANCE NOTICE- OMO#EQ31123", ["EQ31123"], "2026-10-16T15:51:00Z", { reply: "2026-10-16T17:00:00Z" }),
  t("d", "Missing Documents", ["EP27489", "EP27382", "EO18305", "EP04029"], "2026-10-16T15:26:00Z", { kind: "AEP", who: "Deoranie Gafur", text: "1. EP27489 - Affidavit and Invoice 2. EP27382 - Affidavit and Invoice 3. EO18305 - photos 4. EP04029 - update / documents" }),
];
const items = buildPriorities({ threads, rejections: [{ omo: "EP19269", at: "2026-09-25", reason: "Address is spelled incorrectly", by: "HPD" }], toPrint: [{ omo: "EQ17038", savedAt: "2026-10-16T18:00:00Z" }, { omo: "EQ1", savedAt: "x", mailedAt: "y" }], sent: { EP27489: { sentAt: "2026-07-02" } }, done: { "72h:ER01987:a": "2026-10-16" }, now: Date.parse("2026-10-16T20:00:00Z") });
assert.deepEqual(items.map((i) => `${i.kind}:${i.omo}`), ["24h:EQ22426", "rejection:EP19269", "missing:EP27489", "missing:EP27382", "missing:EO18305", "missing:EP04029", "print:EQ17038"]);
assert.equal(items[0].dueAt, "2026-10-19T14:00:00.000Z", "a Friday 24-hour notice: first thing Monday (10 AM)");
assert.equal(items.find((i) => i.omo === "EO18305").want, "photos");
assert.equal(items.find((i) => i.omo === "EP27489").sentAt, "2026-07-02", "already sent shown");
assert.equal(dueText("2026-10-17T16:01:00Z", Date.parse("2026-10-17T12:49:00Z")), "3h 12m left");
assert.equal(dueText("2026-10-17T16:01:00Z", Date.parse("2026-10-17T21:01:00Z")), "overdue 5h 0m");
assert.equal(dueText(null), "");
// Old notices (over 3 weeks) and jobs HPD closed / PIP paid are left out.
const old = buildPriorities({ threads: [t("e", "24 HR POOR PERFORMANCE NOTICE- OMO#EQ1", ["EQ00001"], "2026-08-01T15:00:00Z"), t("f", "24 HR POOR PERFORMANCE NOTICE- OMO#EQ2", ["EQ00002"], "2026-10-16T15:00:00Z")], rejections: [], toPrint: [], sent: {}, done: {}, closed: new Set(["EQ00002"]), now: Date.parse("2026-10-16T20:00:00Z") });
assert.equal(old.length, 0, "old notice and closed job left out");
console.log("PASS priorities: old notices / closed jobs left out; 24-hour notices first with their deadline, answered thread (EQ31123) and handled item (ER01987) left out, rejection, Gafur's missing documents with what each needs and what was already sent, fixed paperwork to print; mailed ones left out");
