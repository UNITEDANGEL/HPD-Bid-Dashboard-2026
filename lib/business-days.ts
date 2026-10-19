// HPD's 24 / 72-hour notices count weekdays only (owner, 18 Oct 2026): a 24-hour notice that comes in on Friday (or over
// the weekend) is answered first thing Monday (due Monday 10 AM); Monday-Thursday ones are due 24 hours later; 72-hour
// ones count three weekdays (Friday -> Wednesday). Days and times are New York's.

const TZ = "America/New_York";
const MONDAY_BY_HOUR = 10; // "first thing Monday"
const parts = (t: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: p.weekday, y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
};
const weekend = (t: number) => { const d = parts(t).day; return d === "Sat" || d === "Sun"; };
// That New York day at `hour`:00 (EDT or EST).
function nyAt(t: number, hour: number) {
  const { y, m, d } = parts(t);
  for (const off of [4, 5]) {
    const guess = Date.UTC(y, m - 1, d, hour + off);
    if (parts(guess).h === hour && parts(guess).d === d) return guess;
  }
  return Date.UTC(y, m - 1, d, hour + 5);
}

// The deadline `hours` (24 or 72) after `iso`, skipping Saturdays and Sundays.
export function dueAfterWeekdays(iso: string, hours: number) {
  let t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const days = Math.max(1, Math.round(hours / 24));
  const received = parts(t).day;
  // 24 hours from Friday or the weekend: first thing Monday.
  if (days === 1 && (received === "Fri" || received === "Sat" || received === "Sun")) {
    do t += 86400000; while (parts(t).day !== "Mon");
    return new Date(nyAt(t, MONDAY_BY_HOUR)).toISOString();
  }
  // Received on a weekend: the clock starts Monday at the same time of day.
  while (weekend(t)) t += 86400000;
  for (let left = days; left > 0; left--) {
    t += 86400000;
    while (weekend(t)) t += 86400000;
  }
  return new Date(t).toISOString();
}
