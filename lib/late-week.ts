// 📋 Friday late list (plan, 19 Nov): Friday afternoon, once, the open jobs whose completion date falls by next Friday
// (or has already passed), soonest first, so the owner can plan next week's route. OMO numbers and dates only.
import { calendarDay, isPendingJob, maturityDate } from "./job-priority";
import { appClosed } from "./job-followup";

type Job = Record<string, unknown>;
export type LateJob = { id: string; due: string; days: number };

const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);

// today: "YYYY-MM-DD" (New York). Next Friday = the Friday of next week (7 days on when today is Friday).
export function lateNextWeek(jobs: Job[], today: string): LateJob[] {
  const t = calendarDay(today);
  if (t === null) return [];
  const weekday = new Date(t * 86400000).getUTCDay();
  // Fri -> +7, Sat -> +6, Sun -> +5 (the coming work week's Friday); Mon -> +11 ... Thu -> +8 (next week's Friday).
  const end = t + (weekday === 5 ? 7 : weekday === 6 ? 6 : weekday === 0 ? 5 : 12 - weekday);
  return jobs.filter((j) => {
    const id = String(j.OMO || j.id || "");
    return id && !/^TEST/i.test(id) && isPendingJob(j) && !appClosed(j) && !j.PaperworkSentAt;
  }).map((j) => {
    const d = calendarDay(maturityDate(j));
    return d === null ? null : { id: String(j.OMO || j.id), due: iso(d), days: d - t };
  }).filter((x): x is LateJob => Boolean(x) && x!.days + t <= end)
    .sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
}

const short = (due: string) => { const [, m, d] = due.split("-"); return `${Number(m)}/${Number(d)}`; };

// "📋 Late list: 3 open jobs are due by next Friday: ER01234 (late since 11/18), ER05678 (due 11/24) and …. Plan the route."
export function lateWeekLine(list: LateJob[]) {
  if (!list.length) return "";
  const bits = list.slice(0, 4).map((x) => `${x.id} (${x.days < 0 ? `late since ${short(x.due)}` : x.days === 0 ? "due today" : `due ${short(x.due)}`})`);
  const names = bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits[0];
  const late = list.filter((x) => x.days < 0).length;
  return `📋 Late list: ${list.length} open job${list.length === 1 ? " is" : "s are"} due by next Friday${late ? ` (${late} already late)` : ""}: ${names}${list.length > 4 ? `, and ${list.length - 4} more` : ""}. Plan next week's route.`;
}

// Friday 1 PM to 5 PM (New York): the afternoon, before the 5 PM Friday wrap takes the chat.
export const isLateWeekTime = (weekday: number, minutes: number) => weekday === 5 && minutes >= 13 * 60 && minutes < 17 * 60;
