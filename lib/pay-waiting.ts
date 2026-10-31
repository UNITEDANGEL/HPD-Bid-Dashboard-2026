// Payment tracker (owner, 31 Oct "do 6"): every job whose paperwork went to HPD, followed until PIP shows it paid:
// sent -> waiting N days -> paid. Jobs waiting too long (over TOO_LONG_DAYS, not paid) are listed together, oldest
// first, with what each should bring in. PIP isn't read by itself (its exports are brought in): a job sent after PIP's
// last download can't show as paid yet, and one PIP's download doesn't list is unknown; neither counts as late.

export const TOO_LONG_DAYS = 90;
export const PAID_RECENT_DAYS = 30;
// No-work service charge (same rule as lib/paperwork.ts): $100 for a bid under $2,000, $300 from $2,000.
const serviceCharge = (award: number) => (award >= 2000 ? 300 : 100);

export type PayWaitStatus = "paid" | "open" | "not-in-pip" | "after-pip";
export type PayWait = {
  omo: string; address: string; sentAt: string; days: number; status: PayWaitStatus;
  amount: number;          // what it should bring in: PIP's open amount, else the award (work) or the service charge (no work)
  estimated: boolean;      // the amount is the app's estimate (PIP has no number for it)
  paid: number; paidAt: string; tooLong: boolean;
};
export type PipJob = { status: string; paid: number; outstanding: number; lastDate?: string };

const NO_WORK = /no access|refus|complied|by others|vacant|not started|different/i;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 86400000);

export function paymentWaits(input: {
  sent: Record<string, { sentAt?: string }>;                         // paperwork found in Sent mail
  emailed?: Record<string, string>;                                  // OMO -> package emailed from the app
  pip: Record<string, PipJob>;
  pipAsOf: string;                                                   // when PIP's numbers were brought in
  jobs: Record<string, { address?: string; award?: number; outcome?: string }>;
  closedReason?: Record<string, string>;                             // HPD's closing reason (what happened)
  now?: number;
  days?: number;                                                     // jobs sent in the last N days (default 365)
}) {
  const now = input.now ?? Date.now();
  const today = dayNum(new Date(now).toISOString());
  const pipDay = input.pipAsOf ? input.pipAsOf.slice(0, 10) : "";
  const omos = new Set([...Object.keys(input.sent), ...Object.keys(input.emailed || {})]);
  const rows: PayWait[] = [];
  for (const omo of omos) {
    const sentAt = [input.sent[omo]?.sentAt || "", (input.emailed || {})[omo] || ""].map((d) => d.slice(0, 10)).sort().pop() || "";
    if (!/^\d{4}-\d\d-\d\d$/.test(sentAt)) continue;
    const days = Math.max(0, today - dayNum(sentAt));
    if (days > (input.days ?? 365)) continue;
    const p = input.pip[omo];
    const job = input.jobs[omo] || {};
    const paidOut = p && p.status === "paid";
    if (paidOut && p.lastDate && today - dayNum(p.lastDate) > PAID_RECENT_DAYS) continue; // paid a while ago: done
    const status: PayWaitStatus = paidOut ? "paid" : p ? "open" : pipDay && sentAt > pipDay ? "after-pip" : "not-in-pip";
    const award = Number(job.award) || 0;
    const noWork = NO_WORK.test(input.closedReason?.[omo] || "") || NO_WORK.test((job.outcome || "").replace(/_/g, " "));
    const fromPip = p && !paidOut && p.outstanding > 0 ? p.outstanding : 0;
    const amount = paidOut ? p.paid : fromPip || (noWork ? serviceCharge(award) : award);
    rows.push({
      omo, address: job.address || "", sentAt, days, status, amount, estimated: !paidOut && !fromPip,
      paid: p ? p.paid : 0, paidAt: paidOut ? p.lastDate || "" : "",
      // Late = PIP itself shows it open after TOO_LONG_DAYS. A job PIP's download doesn't list isn't called late: it's
      // unknown (PIP's Agreement Summary download can leave out recent jobs).
      tooLong: status === "open" && days > TOO_LONG_DAYS,
    });
  }
  rows.sort((a, b) => Number(b.tooLong) - Number(a.tooLong) || Number(a.status === "paid") - Number(b.status === "paid") || b.days - a.days || a.omo.localeCompare(b.omo));
  const waiting = rows.filter((r) => r.status !== "paid");
  const sum = (list: PayWait[]) => list.reduce((s, r) => s + r.amount, 0);
  return {
    rows,
    summary: {
      waiting: waiting.length, waitingAmount: sum(waiting),
      tooLong: rows.filter((r) => r.tooLong).length, tooLongAmount: sum(rows.filter((r) => r.tooLong)),
      afterPip: rows.filter((r) => r.status === "after-pip").length,
      notInPip: rows.filter((r) => r.status === "not-in-pip").length,
      paid: rows.filter((r) => r.status === "paid").length, paidAmount: sum(rows.filter((r) => r.status === "paid")),
    },
  };
}
