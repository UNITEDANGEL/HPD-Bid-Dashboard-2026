// 💵 Today's money (app idea list: "at the top: money earned today and this week from finished jobs, counting up as you
// finish"): the award amounts of the jobs finished (work completed / partial work) today and since Monday, New York time.
// Earned = the work is done; HPD pays later (the money answers say what's paid).

export type MoneyJob = { id: string; amount: number; outcome: string; doneAt: string; address?: string };

const nyDay = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t)) : ""; };
// Monday of the week (New York) as YYYY-MM-DD.
export function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function dayMoney(jobs: MoneyJob[], now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const monday = mondayOf(today);
  const done = jobs.filter((j) => (j.outcome === "WORK_COMPLETED" || j.outcome === "PARTIAL_WORK") && Number(j.amount) > 0 && nyDay(j.doneAt));
  const todayJobs = done.filter((j) => nyDay(j.doneAt) === today);
  const weekJobs = done.filter((j) => { const d = nyDay(j.doneAt); return d >= monday && d <= today; });
  const sum = (xs: MoneyJob[]) => Math.round(xs.reduce((a, j) => a + Number(j.amount), 0));
  return { today: sum(todayJobs), week: sum(weekJobs), todayJobs, weekJobs };
}

export const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function dayMoneyAnswer(m: ReturnType<typeof dayMoney>) {
  if (!m.weekJobs.length) return "💵 No jobs finished this week yet. When you save Work completed on a job, its award amount counts here.";
  const lines = m.todayJobs.slice(0, 6).map((j) => `• ${j.id}${j.address ? ` · ${j.address.replace(/,\s*\d{5}$/, "")}` : ""}: ${dollars(j.amount)}`);
  return `💵 ${m.today ? `${dollars(m.today)} earned today (${m.todayJobs.length} job${m.todayJobs.length === 1 ? "" : "s"} finished)` : "Nothing finished today yet"}; ${dollars(m.week)} this week (${m.weekJobs.length} job${m.weekJobs.length === 1 ? "" : "s"}).${lines.length ? `\n${lines.join("\n")}` : ""}\nHPD pays after the paperwork is approved.`;
}
