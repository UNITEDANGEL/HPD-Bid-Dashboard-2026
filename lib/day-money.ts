// 💵 Today's money (app idea list: "at the top: money earned today and this week from finished jobs, counting up as you
// finish"): the award amounts of the jobs finished (work completed / partial work) today and since Monday, New York time.
// Earned = the work is done; HPD pays later (the money answers say what's paid).

// sentAt = when the closing paperwork was emailed (sent for payment); secondTryAt = the 2nd no-access visit.
// charge = the invoice amount (PackageChargeAmount) when the paperwork was made.
export type MoneyJob = { id: string; amount: number; outcome: string; doneAt: string; address?: string; sentAt?: string; secondTryAt?: string; charge?: number };

const nyDay = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t)) : ""; };
// Monday of the week (New York) as YYYY-MM-DD.
export function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// The names the app really saves (20 Nov, owner: "count all the closed jobs, including the no access, refused... that I
// closed out today and sent for payment"): done by others is COMPLETED_BY_OTHERS, partial PARTIAL_WORK_COMPLETED, and a
// 2nd no-access try NO_ACCESS_2_COMPLETE / NO_ACCESS_COMPLETE; the older names still count.
export const CLOSED_OUTCOME = /^(WORK_COMPLETED|PARTIAL_WORK|PARTIAL_WORK_COMPLETED|REFUSED_ACCESS|WORK_COMPLETED_BY_OTHERS|COMPLETED_BY_OTHERS|NO_ACCESS_2_COMPLETE|NO_ACCESS_COMPLETE)$/;
export const CLOSED = { has: (o: string) => CLOSED_OUTCOME.test(String(o || "")) };
// Closed = a closing outcome, a 2nd no-access try, or the paperwork sent for payment. The day = when it was sent, else
// when the outcome was saved.
const isClosed = (j: MoneyJob) => CLOSED.has(j.outcome) || Boolean(j.secondTryAt && /NO_ACCESS/.test(j.outcome)) || Boolean(j.sentAt); // sent for payment counts even with no outcome saved on this phone
const closedDay = (j: MoneyJob) => nyDay(j.sentAt || "") || (CLOSED.has(j.outcome) ? nyDay(j.doneAt) : nyDay(j.secondTryAt || "") || nyDay(j.doneAt));

// 20 Nov (owner: "Those are no access. Refused access ... is usually $100. Look in the invoices and add them up again"):
// a job counts at its invoice amount; a no-access / refused-access job with no invoice amount saved counts $100, not the
// full award.
export const ACCESS_FEE = 100;
const NO_WORK = /NO_ACCESS|REFUSED/;
export function invoiceAmount(j: MoneyJob) {
  const charge = Number(j.charge);
  if (Number.isFinite(charge) && charge > 0) return charge;
  if (NO_WORK.test(String(j.outcome || ""))) return ACCESS_FEE;
  return Number(j.amount) || 0;
}

export function dayMoney(jobs: MoneyJob[], now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const monday = mondayOf(today);
  // 20 Nov (owner: "today's payment count is not showing all closed jobs"): refused access and completed by others are
  // closed jobs too (closed with an affidavit); doneAt = when the job was closed in the app.
  const done = jobs.map((j) => ({ ...j, amount: invoiceAmount(j) })).filter((j) => isClosed(j) && j.amount > 0 && closedDay(j));
  const todayJobs = done.filter((j) => closedDay(j) === today);
  const weekJobs = done.filter((j) => { const d = closedDay(j); return d >= monday && d <= today; });
  const sum = (xs: MoneyJob[]) => Math.round(xs.reduce((a, j) => a + Number(j.amount), 0));
  return { today: sum(todayJobs), week: sum(weekJobs), todayJobs, weekJobs };
}

export const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function dayMoneyAnswer(m: ReturnType<typeof dayMoney>) {
  if (!m.weekJobs.length) return "💵 No jobs closed this week yet. When you close a job (work completed, partial, refused access or done by others), its award amount counts here.";
  const lines = m.todayJobs.slice(0, 6).map((j) => `• ${j.id}${j.address ? ` · ${j.address.replace(/,\s*\d{5}$/, "")}` : ""}: ${dollars(j.amount)}`);
  return `💵 ${m.today ? `${dollars(m.today)} earned today (${m.todayJobs.length} job${m.todayJobs.length === 1 ? "" : "s"} closed)` : "No job closed today yet"}; ${dollars(m.week)} this week (${m.weekJobs.length} job${m.weekJobs.length === 1 ? "" : "s"}).${lines.length ? `\n${lines.join("\n")}` : ""}\nHPD pays after the paperwork is approved.`;
}
