// Field stats for the phone: what got done today / this week / this month (New York days), from
// the steps saved on each job (FieldVisitHistory, arrival, package email). Self-contained (no
// imports) so the node test can load it on its own.

type Job = Record<string, unknown>;
export type StatsPeriod = "today" | "week" | "month";
export type StatsDay = { day: string; label: string; visited: number; completed: number };
export type FieldStats = {
  period: StatsPeriod;
  label: string;
  counts: { visited: number; completed: number; partial: number; noAccess: number; refused: number; byOthers: number; emailed: number };
  earned: number;
  days: StatsDay[];
};

const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

function nyDay(value: unknown) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? NY_DAY.format(new Date(time)) : "";
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function weekday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dayLabel(iso: string, period: StatsPeriod) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return period === "week" ? date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) : String(d);
}

// Every New York day in the period, oldest first, ending today. Weeks start on Monday.
export function periodDays(period: StatsPeriod, now = new Date()) {
  const today = NY_DAY.format(now);
  let start = today;
  if (period === "week") start = addDays(today, -((weekday(today) + 6) % 7));
  if (period === "month") start = `${today.slice(0, 8)}01`;
  const days: string[] = [];
  for (let day = start; day <= today; day = addDays(day, 1)) days.push(day);
  return days;
}

function periodLabel(period: StatsPeriod, days: string[]) {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  };
  if (period === "today") return `Today · ${fmt(days[0], { weekday: "short", month: "short", day: "numeric" })}`;
  if (period === "week") return `This week · ${fmt(days[0], { month: "short", day: "numeric" })} – ${fmt(days[days.length - 1], { month: "short", day: "numeric" })}`;
  return `This month · ${fmt(days[0], { month: "long", year: "numeric" })}`;
}

// What was charged: the invoice total saved with the package, else the bid (award) amount.
function chargedAmount(job: Job) {
  for (const raw of [job.PackageChargeAmount, job.AwardAmount ?? job.awardAmount]) {
    const amount = Number(String(raw ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

export function fieldStats(jobs: Job[], period: StatsPeriod, options: { skip?: (job: Job) => boolean } = {}, now = new Date()): FieldStats {
  const days = periodDays(period, now);
  const inPeriod = new Set(days);
  const perDay = new Map(days.map((day) => [day, { visited: 0, completed: 0 }]));
  const counts = { visited: 0, completed: 0, partial: 0, noAccess: 0, refused: 0, byOthers: 0, emailed: 0 };
  let earned = 0;

  for (const job of jobs) {
    if (options.skip?.(job)) continue;
    const history = (Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : []) as Record<string, unknown>[];
    const entries = history.filter((entry) => entry && inPeriod.has(nyDay(entry.recordedAt)));

    // A visit: anything recorded on the job that day, or an arrival.
    const visitDays = new Set(entries.map((entry) => nyDay(entry.recordedAt)));
    const arrivedDay = nyDay(job.FieldArrivedAt ?? job.fieldArrivedAt);
    if (inPeriod.has(arrivedDay)) visitDays.add(arrivedDay);
    if (visitDays.size) counts.visited += 1;
    visitDays.forEach((day) => { perDay.get(day)!.visited += 1; });

    // The job's last outcome in the period; a later "Outcome cleared" entry cancels it.
    let last: { outcome: string; day: string } | null = null;
    for (const entry of entries) {
      if (entry.outcome) last = { outcome: String(entry.outcome), day: nyDay(entry.recordedAt) };
      else if (/^outcome cleared/i.test(String(entry.note || ""))) last = null;
    }
    if (last) {
      if (last.outcome === "WORK_COMPLETED" || last.outcome === "PARTIAL_WORK") {
        counts[last.outcome === "WORK_COMPLETED" ? "completed" : "partial"] += 1;
        earned += chargedAmount(job);
        perDay.get(last.day)!.completed += 1;
      } else if (last.outcome.startsWith("NO_ACCESS")) counts.noAccess += 1;
      else if (last.outcome === "REFUSED_ACCESS") counts.refused += 1;
      else if (last.outcome === "WORK_COMPLETED_BY_OTHERS") counts.byOthers += 1;
    }

    if (inPeriod.has(nyDay(job.PackageEmailedAt ?? job.packageEmailedAt))) counts.emailed += 1;
  }

  return {
    period,
    label: periodLabel(period, days),
    counts,
    earned,
    days: days.map((day) => ({ day, label: dayLabel(day, period), ...perDay.get(day)! })),
  };
}
