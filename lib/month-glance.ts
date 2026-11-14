// Month at a glance (owner idea, 14 Nov 2026): one card with jobs done, invoices paid and money still waiting this month.
// Jobs done = paperwork sent to HPD this month; paid = PIP payments dated this month; waiting = what PIP still owes
// on jobs not fully paid, plus the payments on the way. Numbers only, no tenant data.

export type MonthGlance = { month: string; jobsDone: number; paid: number; waiting: number; onTheWay: number; paidAsOf: string };

export function monthGlance(input: {
  sent?: Record<string, { sentAt?: string }> | null;
  pipPaid?: { jobs?: Record<string, { status?: string; outstanding?: number }> } | null;
  payments?: { byMonth?: Record<string, number>; totals?: { disbursed?: number }; generatedAt?: string } | null;
  month: string; // YYYY-MM (New York time)
}): MonthGlance {
  const jobsDone = Object.values(input.sent || {}).filter((s) => String(s?.sentAt || "").slice(0, 7) === input.month).length;
  const paid = Number(input.payments?.byMonth?.[input.month] || 0);
  const onTheWay = Number(input.payments?.totals?.disbursed || 0);
  let waiting = 0;
  for (const j of Object.values(input.pipPaid?.jobs || {})) {
    if (j?.status === "not paid yet" || j?.status === "partly paid") waiting += Math.max(0, Number(j.outstanding) || 0);
  }
  return { month: input.month, jobsDone, paid, waiting, onTheWay, paidAsOf: String(input.payments?.generatedAt || "").slice(0, 10) };
}
