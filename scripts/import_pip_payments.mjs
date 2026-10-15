// Payments from PIP > Check/EFT Summary export: stale-dated checks (never cashed, the City still owes
// them), payments disbursed but not yet "Paid", and what was paid by month. The export stays private
// (data/private/); the app gets date, status, payment ID and amount (no check numbers).
//   node scripts/import_pip_payments.mjs "C:\Users\...\Check-EFT Summary.csv"
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const src = process.argv[2] || path.join(ROOT, "data", "private", "pip_check_eft_summary.csv");
const parse = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === "\"") { q = !q; continue; } if (ch === "," && !q) { out.push(cur); cur = ""; continue; } cur += ch; } out.push(cur); return out.map((v) => v.replace(/^=/, "")); };
const iso = (d) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d || ""); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : ""; };
const lines = fs.readFileSync(src, "utf8").trim().split(/\r?\n/);
const head = parse(lines[0]);
const payments = lines.slice(1).map((line) => {
  const r = Object.fromEntries(head.map((h, i) => [h, parse(line)[i]]));
  return { date: iso(r["Status Date"]), status: r["Check/EFT Status"], id: r["Payment ID"], amount: Number(r["Net Payment Amount"] || r.Amount || 0), department: r.Department };
}).filter((p) => p.date).sort((a, b) => b.date.localeCompare(a.date));
const byMonth = {};
for (const p of payments) if (p.status === "Paid") byMonth[p.date.slice(0, 7)] = Math.round(((byMonth[p.date.slice(0, 7)] || 0) + p.amount) * 100) / 100;
const sum = (list) => Math.round(list.reduce((a, p) => a + p.amount, 0) * 100) / 100;
const stale = payments.filter((p) => /stale/i.test(p.status));
const disbursed = payments.filter((p) => /disbursed/i.test(p.status));
fs.writeFileSync(path.join(ROOT, "public", "data", "pip_payments.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), source: "PIP Check/EFT Summary",
  totals: { count: payments.length, paid: sum(payments.filter((p) => p.status === "Paid")), stale: sum(stale), staleCount: stale.length, disbursed: sum(disbursed), disbursedCount: disbursed.length, from: payments.at(-1)?.date, to: payments[0]?.date },
  stale, disbursed, byMonth, recent: payments.filter((p) => p.status === "Paid").slice(0, 60),
}));
console.log(`PIP payments: ${payments.length}; stale-dated ${stale.length} ($${sum(stale)}); disbursed not paid ${disbursed.length} ($${sum(disbursed)})`);
