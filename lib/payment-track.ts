// Rejections tracked to the money (owner, 17 Oct 2026): each payment rejection from procurement followed until HPD
// pays it in PIP: rejected -> fixed -> printed & signed in ink -> copy emailed -> original mailed -> paid. Shows the
// dollars each one holds up. Steps tick from the corrections saved on this phone (print folder), the paperwork on
// record, and PIP (pip_paid.json, refreshed by the fetcher).

import type { Rejection } from "./job-followup";

export type PayStepKey = "rejected" | "fixed" | "printed" | "emailed" | "mailed" | "paid";
export const PAY_STEPS: { key: PayStepKey; label: string; icon: string }[] = [
  { key: "rejected", label: "Rejected", icon: "❗" },
  { key: "fixed", label: "Fixed", icon: "✏️" },
  { key: "printed", label: "Printed & signed", icon: "🖨" },
  { key: "emailed", label: "Copy emailed", icon: "✉" },
  { key: "mailed", label: "Original mailed", icon: "📮" },
  { key: "paid", label: "Paid in PIP", icon: "💵" },
];
export type PayCorrection = { omo: string; savedAt: string; printedAt?: string; emailedAt?: string; mailedAt?: string };
export type PayRow = {
  omo: string; address: string; at: string; reason: string; attempt: string;
  status: "held" | "paid" | "lost";          // held: money still open in PIP; lost: HPD closed it with $0 paid
  held: number; paid: number;
  inPip: boolean;                            // false: PIP has no record yet (amount unknown)
  steps: Record<PayStepKey, { done: boolean; at: string }>;
  next: PayStepKey | null;
};

const day = (iso?: string) => String(iso || "").slice(0, 10);

export function trackPayments(input: {
  rejections: Rejection[];
  corrections: PayCorrection[];                       // the print folder (saved fixes, with their dates)
  sent?: Record<string, { sentAt?: string }>;         // paperwork on record (resent by email counts as mailed? no: only as fixed)
  days?: number;                                      // paid / lost ones from the last N days (default 90)
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const days = input.days ?? 90;
  const rows: PayRow[] = [];
  for (const r of input.rejections) {
    const status: PayRow["status"] = r.pay === "paid" ? "paid" : r.pay === "lost" ? "lost" : "held";
    // Money still held: every one. Paid or lost: only recent ones (to see what the fixes brought in).
    if (status !== "held" && now - Date.parse(r.at) > days * 86400000) continue;
    // Not in PIP yet: kept while it's still waiting on us (the amount shows once PIP has it).
    if (r.pay === "" && r.answered) continue;
    const fix = input.corrections.filter((c) => c.omo === r.omo && day(c.savedAt) >= day(r.at)).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
    const resent = input.sent?.[r.omo]?.sentAt && day(input.sent[r.omo].sentAt) >= day(r.at) ? day(input.sent[r.omo].sentAt) : "";
    const fixedAt = fix?.savedAt || r.correctedAt || resent;
    const steps: PayRow["steps"] = {
      rejected: { done: true, at: r.at },
      fixed: { done: !!fixedAt, at: fixedAt || "" },
      printed: { done: !!fix?.printedAt, at: fix?.printedAt || "" },
      emailed: { done: !!fix?.emailedAt, at: fix?.emailedAt || "" },
      mailed: { done: !!fix?.mailedAt, at: fix?.mailedAt || "" },
      paid: { done: status === "paid", at: "" },
    };
    // Paid means the earlier steps are behind us, whatever was recorded on this phone.
    if (status === "paid") for (const k of ["fixed", "printed", "emailed", "mailed"] as PayStepKey[]) if (!steps[k].done) steps[k] = { done: true, at: "" };
    rows.push({
      omo: r.omo, address: r.address, at: r.at, reason: r.reason, attempt: r.attempt, status,
      held: status === "held" ? r.openAmount : 0, paid: r.paidAmount, inPip: r.pay !== "",
      steps, next: status === "held" ? PAY_STEPS.find((s) => !steps[s.key].done)?.key ?? null : null,
    });
  }
  // Money held first (biggest first), then paid, then lost.
  const rank = { held: 0, paid: 1, lost: 2 } as const;
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.held - a.held || b.at.localeCompare(a.at));
  const held = rows.filter((r) => r.status === "held");
  const paid = rows.filter((r) => r.status === "paid");
  const lost = rows.filter((r) => r.status === "lost");
  return {
    rows,
    summary: {
      held: held.reduce((a, r) => a + r.held, 0), heldCount: held.length,
      withAmount: held.filter((r) => r.inPip).length, notInPip: held.filter((r) => !r.inPip).length,
      toFix: held.filter((r) => r.next === "fixed").length,
      inTheMail: held.filter((r) => r.steps.mailed.done).length,
      paid: paid.reduce((a, r) => a + r.paid, 0), paidCount: paid.length,
      lostCount: lost.length,
    },
  };
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
