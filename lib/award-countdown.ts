// ⏳ Days left to finish after award (plan, 21 Nov 2026): the awarded jobs still open (paperwork not sent, HPD hasn't
// closed them), with the days left until HPD's completion date, late ones and the closest first. OMO numbers and dates only.
import { calendarDay } from "./job-priority";

type Award = { OMO?: string; AwardDate?: string; WorkCompletionDate?: string };
export type Countdown = { omo: string; due: string; days: number; given: number | null };

const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);

// today: "YYYY-MM-DD" (New York). Jobs awarded more than `lookback` days ago are left out (old, likely closed elsewhere).
export function awardCountdown(opts: { awards: Award[] | null | undefined; sent?: Record<string, unknown> | null; closed?: Record<string, unknown> | null; today: string; lookback?: number }): Countdown[] {
  const t = calendarDay(opts.today);
  if (t === null) return [];
  const lookback = opts.lookback ?? 90;
  const seen = new Set<string>();
  const out: Countdown[] = [];
  for (const a of opts.awards || []) {
    const omo = String(a.OMO || "").trim().toUpperCase();
    if (!omo || /^TEST/.test(omo) || seen.has(omo)) continue;
    if (opts.sent?.[omo] || opts.closed?.[omo]) continue;
    const aw = calendarDay(String(a.AwardDate || "").trim());
    const due = calendarDay(String(a.WorkCompletionDate || "").trim());
    if (aw === null || due === null || aw > t || t - aw > lookback) continue;
    seen.add(omo);
    out.push({ omo, due: iso(due), days: due - t, given: due >= aw ? due - aw : null });
  }
  return out.sort((x, y) => x.days - y.days || x.omo.localeCompare(y.omo));
}

// "32 days late" / "due today" / "1 day left" / "4 days left"
export function daysLeftText(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  if (days === 0) return "due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

// 👷 Finish-by date in the worker message (plan, 21 Nov): HPD's completion date in plain words with the days left,
// e.g. "Tue, Nov 24 (3 days left)" / "Mon, Feb 9, 2026 (285 days late)". The year shows only when it isn't this year.
// A date it can't read comes back as it was.
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function finishByText(raw: string | null | undefined, today: string): string {
  const s = String(raw || "").trim().replace(/[T ].*$/, "");
  const d = calendarDay(s);
  if (d === null) return String(raw || "").trim();
  const t = calendarDay(today);
  const dt = new Date(d * 86400000);
  const sameYear = t !== null && new Date(t * 86400000).getUTCFullYear() === dt.getUTCFullYear();
  const day = `${WD[dt.getUTCDay()]}, ${MO[dt.getUTCMonth()]} ${dt.getUTCDate()}${sameYear ? "" : `, ${dt.getUTCFullYear()}`}`;
  return t === null ? day : `${day} (${daysLeftText(d - t)})`;
}

// Today in New York as "YYYY-MM-DD".
export function nyDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
