// Friday score (owner idea, 14 Nov 2026): the week so far (Monday to today, New York time) in four numbers:
// paperwork sent to HPD, jobs won (awards dated this week), invoices finished (sent paperwork that PIP shows paid)
// and money paid in. A trophy shows on a good week. Numbers only, no tenant data.

// last = the same days of last week (Monday to the same weekday), so the arrows compare like with like.
export type WeekNumbers = { sent: number; won: number; moneyIn: number };
export type WeekScore = WeekNumbers & { from: string; trophy: boolean; stars: number; last: WeekNumbers };

// This week vs last week (plan, 20 Nov): ▲ up, ▼ down, = same.
export function trend(now: number, before: number): "up" | "down" | "same" {
  return now > before ? "up" : now < before ? "down" : "same";
}
export const trendMark = (now: number, before: number) => ({ up: "▲", down: "▼", same: "=" })[trend(now, before)];

const shift = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Monday (YYYY-MM-DD) of the week that contains the given YYYY-MM-DD day.
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// COA award dates are "01/05/26" (or ISO).
export function isoDay(v: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v || "");
  if (!m) return String(v || "").slice(0, 10);
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function weekScore(input: {
  sent?: Record<string, { sentAt?: string }> | null;
  awards?: { OMO?: string; AwardDate?: string }[] | null;
  payments?: { recent?: { date?: string; status?: string; amount?: number }[] } | null;
  today: string; // YYYY-MM-DD (New York time)
}): WeekScore {
  const from = weekStart(input.today);
  const count = (start: string, end: string): WeekNumbers => {
    const inWeek = (d: string) => d >= start && d <= end;
    return {
      sent: Object.values(input.sent || {}).filter((s) => inWeek(String(s?.sentAt || "").slice(0, 10))).length,
      won: (input.awards || []).filter((a) => String(a.OMO || "").toUpperCase() !== "TEST-0001" && inWeek(isoDay(String(a.AwardDate || "")))).length,
      moneyIn: (input.payments?.recent || []).filter((p) => p?.status === "Paid" && inWeek(String(p.date || "").slice(0, 10))).reduce((t, p) => t + (Number(p.amount) || 0), 0),
    };
  };
  const { sent, won, moneyIn } = count(from, input.today);
  const last = count(shift(from, -7), shift(input.today, -7));
  // One star each for: 5+ jobs sent, 3+ jobs won, any money in. A trophy at two stars or more.
  const stars = (sent >= 5 ? 1 : 0) + (won >= 3 ? 1 : 0) + (moneyIn > 0 ? 1 : 0);
  return { from, sent, won, moneyIn, trophy: stars >= 2, stars, last };
}
