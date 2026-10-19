// HPD's 24 / 72-hour notices count working days only (owner, 18 Oct 2026; City holidays added 19 Oct): a 24-hour notice that comes in on Friday (or over
// the weekend) is answered first thing Monday (due Monday 10 AM); Monday-Thursday ones are due 24 hours later; 72-hour
// ones count three weekdays (Friday -> Wednesday). Days and times are New York's.

const TZ = "America/New_York";
const MONDAY_BY_HOUR = 10; // "first thing Monday"
const parts = (t: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: p.weekday, y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
};
// New York City holidays (HPD is closed): a notice is not due on one. Saturday holidays are kept on Friday, Sunday ones
// on Monday, like the City does.
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const nthWeekday = (y: number, m: number, wd: number, n: number) => { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; };
const lastWeekday = (y: number, m: number, wd: number) => { const last = new Date(Date.UTC(y, m, 0)); return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7); };
const observed = (y: number, m: number, d: number) => { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); const t = Date.UTC(y, m - 1, d) + (wd === 6 ? -86400000 : wd === 0 ? 86400000 : 0); const o = new Date(t); return iso(o.getUTCFullYear(), o.getUTCMonth() + 1, o.getUTCDate()); };
const holidayCache = new Map<number, Map<string, string>>();
export function nycHolidays(y: number) {
  const hit = holidayCache.get(y);
  if (hit) return hit;
  const electionDay = nthWeekday(y, 11, 1, 1) + 1; // the Tuesday after the first Monday of November
  const list: [string, string][] = [
    [observed(y, 1, 1), "New Year's Day"],
    [iso(y, 1, nthWeekday(y, 1, 1, 3)), "Martin Luther King Jr. Day"],
    [observed(y, 2, 12), "Lincoln's Birthday"],
    [iso(y, 2, nthWeekday(y, 2, 1, 3)), "Presidents' Day"],
    [iso(y, 5, lastWeekday(y, 5, 1)), "Memorial Day"],
    [observed(y, 6, 19), "Juneteenth"],
    [observed(y, 7, 4), "Independence Day"],
    [iso(y, 9, nthWeekday(y, 9, 1, 1)), "Labor Day"],
    [iso(y, 10, nthWeekday(y, 10, 1, 2)), "Columbus Day"],
    [iso(y, 11, electionDay), "Election Day"],
    [observed(y, 11, 11), "Veterans Day"],
    [iso(y, 11, nthWeekday(y, 11, 4, 4)), "Thanksgiving"],
    [observed(y, 12, 25), "Christmas"],
    [observed(y + 1, 1, 1), "New Year's Day"], // 1 Jan on a Saturday is kept on 31 Dec
  ];
  const out = new Map(list.filter(([k]) => k.startsWith(`${y}-`)));
  holidayCache.set(y, out);
  return out;
}
// The holiday's name when that New York day is one.
export function holidayOn(t: number) { const { y, m, d } = parts(t); return nycHolidays(y).get(iso(y, m, d)) || ""; }
// The City holidays between two times (what pushed a deadline back), by name.
export function holidaysBetween(fromIso: string, toIso: string) {
  const a = Date.parse(fromIso), b = Date.parse(toIso), out: string[] = [];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return out;
  for (let t = a; t <= b; t += 86400000) { const h = holidayOn(t); if (h && !out.includes(h)) out.push(h); }
  return out;
}
const weekend = (t: number) => { const d = parts(t).day; return d === "Sat" || d === "Sun"; };
const off = (t: number) => weekend(t) || Boolean(holidayOn(t));
// That New York day at `hour`:00 (EDT or EST).
function nyAt(t: number, hour: number) {
  const { y, m, d } = parts(t);
  for (const off of [4, 5]) {
    const guess = Date.UTC(y, m - 1, d, hour + off);
    if (parts(guess).h === hour && parts(guess).d === d) return guess;
  }
  return Date.UTC(y, m - 1, d, hour + 5);
}

// The deadline `hours` (24 or 72) after `iso`, skipping Saturdays, Sundays and City holidays.
export function dueAfterWeekdays(iso: string, hours: number) {
  let t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const days = Math.max(1, Math.round(hours / 24));
  // 24 hours from Friday, the day before a holiday, or a day off: first thing the next working day (10 AM).
  if (days === 1 && (off(t) || off(t + 86400000))) {
    do t += 86400000; while (off(t));
    return new Date(nyAt(t, MONDAY_BY_HOUR)).toISOString();
  }
  // Received on a day off: the clock starts the next working day at the same time of day.
  while (off(t)) t += 86400000;
  for (let left = days; left > 0; left--) {
    t += 86400000;
    while (off(t)) t += 86400000;
  }
  return new Date(t).toISOString();
}
