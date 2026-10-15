// Paid / not paid for each job, from PIP (NYC Payee Information Portal) > Agreement Summary export:
// each purchase order's tracking number holds the OMO ("8062027EP04183" = EP04183), with what was
// encumbered, expended (paid) and is outstanding. The export stays private (data/private/); the app gets
// only, per OMO: paid amount, outstanding, closed (public/data/pip_paid.json; City payments are public data).
//   node scripts/import_pip_agreements.mjs "C:\Users\...\Agreement Summary.csv"
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const src = process.argv[2] || path.join(ROOT, "data", "private", "pip_agreement_summary.csv");
const parse = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === "\"") { q = !q; continue; } if (ch === "," && !q) { out.push(cur); cur = ""; continue; } cur += ch; } out.push(cur); return out.map((v) => v.replace(/^=/, "")); };
const iso = (d) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d || ""); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : ""; };
const lines = fs.readFileSync(src, "utf8").trim().split(/\r?\n/);
const head = parse(lines[0]);
const out = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "pip_paid.json"), "utf8")).jobs; } catch { return {}; } })();
const seen = {};
for (const line of lines.slice(1)) {
  const r = Object.fromEntries(head.map((h, i) => [h, parse(line)[i]]));
  const m = /^806\d{4}(E[A-Z]\d{5})/.exec(r["Tracking Number"] || "");
  if (!m) continue;
  const omo = m[1];
  const row = (seen[omo] ||= { paid: 0, outstanding: 0, closed: true, closedDate: "", lastDate: "" });
  row.paid += Number(r.Expended || 0);
  row.outstanding += Number(r.Outstanding || 0);
  row.closed = row.closed && r["Closed?"] === "Yes";
  row.closedDate = [row.closedDate, iso(r["Closed Date"])].sort().at(-1);
  row.lastDate = [row.lastDate, iso(r["Transaction Date"])].sort().at(-1);
}
for (const [omo, r] of Object.entries(seen)) {
  out[omo] = { status: r.paid > 0 && r.outstanding < 0.01 ? "paid" : r.paid > 0 ? "partly paid" : "not paid yet", paid: Math.round(r.paid * 100) / 100, outstanding: Math.round(r.outstanding * 100) / 100, closed: r.closed, closedDate: r.closedDate, lastDate: r.lastDate };
}
fs.writeFileSync(path.join(ROOT, "public", "data", "pip_paid.json"), JSON.stringify({ generatedAt: new Date().toISOString(), source: "PIP Agreement Summary", jobs: out }));
const counts = Object.values(out).reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
console.log(`PIP: ${Object.keys(seen).length} OMOs in this export; ${Object.keys(out).length} on file:`, counts);
