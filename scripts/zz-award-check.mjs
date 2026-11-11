import fs from "node:fs";
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const sent = read("data/sent_paperwork_dates.json").jobs;
const rows = [];
for (const f of ["public/data/COA_Fetcher_2026.json", "public/data/COA_older.json", "public/data/jobs_2024_2025.json"]) {
  const d = read(f); if (!d) continue;
  const a = Array.isArray(d) ? d : d.jobs || d.rows || d.data || Object.values(d).find(Array.isArray) || [];
  rows.push(...a);
}
const id = (j) => String(j.OMO || j.omo || j.OMONumber || j.JobId || j.Job_ID || j.id || "").toUpperCase();
const iso = (s) => { const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; const n = String(s || "").match(/\d{4}-\d{2}-\d{2}/); return n ? n[0] : ""; };
const award = new Map(); for (const j of rows) { const o = id(j); if (o && j.AwardDate && !award.has(o)) award.set(o, iso(j.AwardDate)); }
const pip = read("public/data/pip_paid.json") || {}; const paid = new Set(Object.keys(pip.jobs || pip));
const status = read("public/data/hpd_job_status.json")?.jobs || {};
let n = 0, wrong = [], noAward = 0, unknown = 0;
for (const [o, s] of Object.entries(sent)) {
  n++;
  const a = award.get(o);
  if (!s.awardDate) { noAward++; continue; }
  if (!a) { unknown++; continue; }
  if (s.awardDate !== a) wrong.push({ o, line2: s.awardDate, award: a, work: s.workStart || s.workComplete || "", sent: s.sentAt, paid: paid.has(o), hpd: status[o]?.closedReason || "" });
}
console.log({ sentJobs: n, withLine2Date: n - noAward, unknownAward: unknown, wrong: wrong.length, wrongUnpaid: wrong.filter((w) => !w.paid).length, line2IsWorkDate: wrong.filter((w) => w.line2 === w.work).length });
for (const w of wrong.filter((w) => !w.paid).sort((a, b) => b.sent.localeCompare(a.sent)).slice(0, 60)) console.log(w.o, "line2", w.line2, "award", w.award, "sent", w.sent, w.hpd ? "hpd:" + w.hpd.slice(0, 20) : "");
