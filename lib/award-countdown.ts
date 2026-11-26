// ⏳ Days left to finish after award (plan, 21 Nov 2026): the awarded jobs still open (paperwork not sent, HPD hasn't
// closed them), with the days left until HPD's completion date, late ones and the closest first. OMO numbers and dates only.
import { calendarDay } from "./job-priority";

type Award = { OMO?: string; AwardDate?: string; WorkCompletionDate?: string; AwardAmount?: string | number };
export type Countdown = { omo: string; due: string; days: number; given: number | null; amount?: number | null };

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
    const amt = Number(String(a.AwardAmount ?? "").replace(/[$,\s]/g, ""));
    out.push({ omo, due: iso(due), days: due - t, given: due >= aw ? due - aw : null, amount: amt > 0 ? amt : null });
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

// 📅 Finish dates on a calendar (plan item 20, 21 Nov): one month as weeks (Sunday first), each day with the open
// awarded jobs due that day, so the busy weeks show coming. month: "YYYY-MM". Days outside the month are null.
export type CalendarDay = { iso: string; date: number; jobs: Countdown[]; today: boolean };
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function finishMonth(list: Countdown[], month: string, today: string): (CalendarDay | null)[][] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const first = new Date(Date.UTC(y, mo, 1));
  const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const cells: (CalendarDay | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, date: d, jobs: list.filter((c) => c.due === iso), today: iso === today });
  }
  while (cells.length % 7) cells.push(null);
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// "YYYY-MM" moved by n months.
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
// 🗺 Closest finish dates first in Plan my day (plan item 24, 22 Nov): days left to HPD's completion date for an awarded
// job awarded in the last 90 days, like the ⏳ card (null otherwise or with no finish date), the ranking boost (late ones and the closest first, nothing after
// 14 days) and the stop's line ("Due in 2 days (HPD finish date)").
export function jobFinishDays(job: Record<string, unknown>, today: string): number | null {
  const pick = (keys: string[]) => String(keys.map((k) => job[k]).find((v) => v !== undefined && v !== null && String(v).trim()) || "").trim().replace(/[T ].*$/, "");
  if (/^TEST/i.test(String(job.OMO || job.omo || "").trim())) return null;
  const t = calendarDay(today);
  const aw = calendarDay(pick(["AwardDate", "awardDate", "Award Date"]));
  const due = calendarDay(pick(["WorkCompletionDate", "workCompletionDate", "Work Completion Date"]));
  if (t === null || aw === null || due === null || aw > t || t - aw > 90) return null;
  return due - t;
}
export function finishPlanBoost(days: number | null): number {
  if (days === null || days > 14) return 0;
  if (days < 0) return 1000 + Math.min(-days, 30);
  return 950 - days * 60;
}
export function finishStopLabel(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late (HPD finish date)`;
  if (days === 0) return "Due today (HPD finish date)";
  return `Due in ${days} day${days === 1 ? "" : "s"} (HPD finish date)`;
}

// 💵 Maturity this week (plan item 35, 23 Nov): the open awarded jobs whose maturity date (HPD's finish date)
// is today or in the next 7 days, closest first, so the owner knows which to finish and send first. Late ones stay
// on the ⏳ card.
export function maturityWeek(list: Countdown[]): Countdown[] {
  return list.filter((c) => c.days >= 0 && c.days <= 7).sort((x, y) => x.days - y.days || x.omo.localeCompare(y.omo));
}

// 💲 Money in this week's maturity (plan, 24 Nov): the award money riding on this week's maturity jobs.
export function maturityMoney(list: Countdown[]): number {
  return list.reduce((t, c) => t + (c.amount && c.amount > 0 ? c.amount : 0), 0);
}

// 📤 Send this week's list to the worker (plan, 24 Nov): the maturity jobs, closest first, with the building address
// and finish date only (no tenant names, phones or money), ready for the phone's Share menu.
export function maturityWorkerText(list: Countdown[], addresses: Record<string, string>, today: string): string {
  if (!list.length) return "";
  const lines = list.map((c, i) => {
    const addr = String(addresses[c.omo] || "").replace(/\s+/g, " ").trim();
    return `${i + 1}. ${c.omo}${addr ? ` - ${addr}` : ""}\n   Finish by ${finishByText(c.due, today)}`;
  });
  return [`Jobs to finish this week (${list.length}), closest date first:`, ...lines, "Send me the photos when each one is done. Thanks!"].join("\n");
}

// 🚧 Not started yet (plan, 25 Nov): maturity jobs with no visit and no photo yet (from the job's saved steps, or the
// visits / photos on this phone), so the owner sees which ones are at risk of missing HPD's finish date.
const STARTED_KEYS = ["TravelStartedAt", "FieldArrivedAt", "VisitStartedAt", "JobStartedAt", "OnSiteStartedAt", "OnSiteEndedAt", "LastFieldVisitAt", "lastFieldVisitAt", "ActualWorkCompletionDate", "FieldOutcome", "fieldOutcome", "OutcomeLockedAt"];
export function maturityNotStarted(list: Countdown[], opts: { overrides?: Record<string, Record<string, unknown>> | null; started?: Iterable<string> | null }): string[] {
  const seen = new Set([...(opts.started || [])].map((s) => String(s).trim().toUpperCase()));
  return list.filter((c) => {
    const omo = c.omo.toUpperCase();
    if (seen.has(omo)) return false;
    const o = opts.overrides?.[omo] || {};
    if (STARTED_KEYS.some((k) => String(o[k] ?? "").trim())) return false;
    if (Number(o.BeforePhotoCount) > 0 || Number(o.AfterPhotoCount) > 0) return false;
    return true;
  }).map((c) => c.omo);
}

// 🟠 Before but no After (plan item 44, 26 Nov): maturity jobs with Before photos but no After yet (on this phone, or the
// counts saved on the job), so the affidavit isn't held up by a missing After photo.
export function maturityNeedsAfter(list: Countdown[], opts: { overrides?: Record<string, Record<string, unknown>> | null; photos?: Record<string, { before?: number; after?: number }> | null }): string[] {
  const here = Object.fromEntries(Object.entries(opts.photos || {}).map(([k, v]) => [k.trim().toUpperCase(), v || {}]));
  return list.filter((c) => {
    const omo = c.omo.toUpperCase();
    const o = opts.overrides?.[omo] || {};
    const p = here[omo] || {};
    return photosNeedAfter(o, p);
  }).map((c) => c.omo);
}

// Before photos (on this phone or saved on the job) and no After anywhere.
export function photosNeedAfter(row: Record<string, unknown> | null | undefined, here?: { before?: number; after?: number } | null): boolean {
  const o = row || {};
  const p = here || {};
  const before = Math.max(Number(p.before) || 0, Number(o.BeforePhotoCount) || 0);
  const after = Math.max(Number(p.after) || 0, Number(o.AfterPhotoCount) || 0);
  return before > 0 && after === 0;
}

// 🟠 Needs After on the map (plan item 45, 26 Nov): an awarded job not sent yet, due within 7 days (or late), with Before
// photos saved on the job and no After: the same orange tag on its map pin, so it's seen while driving the route.
export function pinNeedsAfter(row: Record<string, unknown> | null | undefined, daysLeft: number | null | undefined): boolean {
  return typeof daysLeft === "number" && daysLeft <= 7 && photosNeedAfter(row);
}
