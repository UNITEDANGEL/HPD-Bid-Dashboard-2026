// "Where is my money?" (owner idea, 14 Nov 2026): jobs sent to HPD that PIP still shows as not paid, oldest first,
// with the days waiting counted from the day the paperwork was sent. OMO numbers and amounts only, no tenant data.

export type OwedJob = { omo: string; days: number; amount: number; partly: boolean };

// Owner idea 14 Nov: "Unpaid jobs reminder": sent but not paid after this many days is flagged.
export const LATE_DAYS = 30;
export function lateLine(jobs: OwedJob[]): string {
  const late = jobs.filter((j) => j.days >= LATE_DAYS);
  if (!late.length) return "";
  return `${late.length} job${late.length === 1 ? "" : "s"} unpaid over ${LATE_DAYS} days: ${late.map((j) => `${j.omo} (${j.days} days)`).join(", ")}`;
}

function daysBetween(from: string, to: string) {
  const a = Date.parse(from.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(to.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}

export function whoOwes(input: {
  sent?: Record<string, { sentAt?: string }> | null;
  pipPaid?: { jobs?: Record<string, { status?: string; outstanding?: number }> } | null;
  today: string; // YYYY-MM-DD (New York time)
}): { jobs: OwedJob[]; total: number; count: number } {
  const all: OwedJob[] = [];
  for (const [omo, s] of Object.entries(input.sent || {})) {
    const p = input.pipPaid?.jobs?.[omo];
    if (!s?.sentAt || !p) continue;
    if (p.status !== "not paid yet" && p.status !== "partly paid") continue;
    const amount = Number(p.outstanding) || 0;
    if (amount <= 0) continue;
    all.push({ omo, days: daysBetween(s.sentAt, input.today), amount, partly: p.status === "partly paid" });
  }
  all.sort((x, y) => y.days - x.days || y.amount - x.amount);
  return { jobs: all.slice(0, 5), total: all.reduce((n, j) => n + j.amount, 0), count: all.length };
}
