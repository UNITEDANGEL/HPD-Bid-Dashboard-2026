// 🧾 Costs on the job (idea list: "receipt photo on the job: the amount goes to that job's costs"). Each cost is an
// amount and what it was for ("Home Depot, door closer"), saved on the job (shared, so the computer sees it too: no
// tenant data in it); the receipt photo stays on the phone. The card shows what was spent and what's left of the award.

export type JobCost = { at: string; amount: number; what: string };

const round = (n: number) => Math.round(n * 100) / 100;
export const usd = (n: number) => `$${round(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// "45.20 home depot door closer", "spent $45 at Home Depot", "receipt 120 for paint" -> { amount, what }.
export function parseCost(text: string): { amount: number; what: string } | null {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const m = /\$?\s*(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)\s*(dollars?|bucks)?/i.exec(t);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  if (!(amount > 0) || amount > 50000) return null;
  const what = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length))
    .replace(/\b(i\s+)?(spent|paid|receipt|add(ed)?|a|cost|of|on|for|at)\b/gi, " ")
    .replace(/\b(job\s+)?[A-Z]{2}\s?\d{4,6}\b/gi, " ")
    .replace(/[,.;:]+/g, " ").replace(/\s+/g, " ").trim();
  return { amount: round(amount), what: what ? what[0].toUpperCase() + what.slice(1) : "" };
}

export function readCosts(v: unknown): JobCost[] {
  return Array.isArray(v) ? v.filter((c) => c && Number(c.amount) > 0).map((c) => ({ at: String(c.at || ""), amount: round(Number(c.amount)), what: String(c.what || "").slice(0, 80) })) : [];
}

export function costTotal(costs: JobCost[]) {
  return round(costs.reduce((s, c) => s + c.amount, 0));
}

export function costLine(costs: JobCost[], award: number) {
  if (!costs.length) return "";
  const total = costTotal(costs);
  return `${usd(total)} spent${award > 0 ? ` · ${usd(award - total)} left of ${usd(award)}` : ""}`;
}

// 📷 -> 🧾 The receipt read by the free picture AI (server/ai-draft aiReadPhoto, Cloudflare's own model): asked for one
// line "TOTAL <amount> STORE <name>". Its answer fills the box to check; nothing is saved until you tap Add.
export const RECEIPT_QUESTION = "This is a store receipt. Answer with one line only, exactly like: TOTAL 45.20 STORE Home Depot. Use the final total paid (with tax). If you can't read the total, answer: TOTAL unclear.";
export function receiptFromText(text: string): { amount: number; store: string } | null {
  const t = String(text || "").replace(/\s+/g, " ");
  const total = /TOTAL[^0-9a-z]{0,6}\$?\s*(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)/i.exec(t) || /\$\s*(\d{1,5}(?:,\d{3})*\.\d{2})/.exec(t);
  if (!total) return null;
  const amount = Math.round(Number(total[1].replace(/,/g, "")) * 100) / 100;
  if (!(amount > 0) || amount > 50000) return null;
  const store = (/STORE[:\s]+([A-Za-z0-9&'. -]{2,40}?)(?:[.,;]|\s+TOTAL|$)/i.exec(t)?.[1] || "").trim().replace(/\.$/, "");
  return { amount, store: /^(unclear|unknown|n\/?a)$/i.test(store) ? "" : store };
}
