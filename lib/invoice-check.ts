// 🧾 Invoice check (app idea list: "before the invoice goes out, the app checks the amount matches the award and the
// COA, and says what doesn't"). Pure: the paperwork form's amount, the award (bid) amount and the dates.

export type CheckLine = { tone: "ok" | "warn"; text: string };

const num = (v: string | number | undefined | null) => { const n = Number(String(v ?? "").replace(/[$,\s()]/g, "")); return Number.isFinite(n) ? n : 0; };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
// "11/07/26", "2026-11-07" -> a day number (NaN when unreadable).
const day = (v: string) => {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec((v || "").trim());
  if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]) / 864e5;
  return NaN;
};

export function invoiceCheck(f: { outcome: string; amount: string; bidAmount: string; invoiceDate?: string; workComplete?: string }): CheckLine[] {
  const out: CheckLine[] = [];
  const amount = num(f.amount || f.bidAmount), bid = num(f.bidAmount);
  if (!bid) out.push({ tone: "warn", text: "No award amount on file: check the amount on the COA before sending." });
  if (amount <= 0) out.push({ tone: "warn", text: "The invoice has no amount." });
  else if (bid && f.outcome === "work_completed") {
    const d = Math.round((amount - bid) * 100) / 100;
    out.push(d === 0
      ? { tone: "ok", text: `The invoice matches the award: ${money(bid)}.` }
      : { tone: "warn", text: `The invoice is ${money(amount)}, ${money(Math.abs(d))} ${d > 0 ? "more" : "less"} than the award (${money(bid)}). HPD pays the award unless a change was approved.` });
  } else if (bid && f.outcome === "partial_work_completed") {
    out.push(amount >= bid
      ? { tone: "warn", text: `Partial work is ${money(amount)}, not less than the award (${money(bid)}). Lower it to the part that was done.` }
      : { tone: "ok", text: `Partial work: ${money(amount)} of the ${money(bid)} award (${Math.round((amount / bid) * 100)}%).` });
  }
  const inv = day(f.invoiceDate || ""), done = day(f.workComplete || "");
  if (Number.isFinite(inv) && Number.isFinite(done) && inv < done) out.push({ tone: "warn", text: "The invoice is dated before the work was finished." });
  return out;
}
