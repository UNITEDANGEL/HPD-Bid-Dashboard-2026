// Time on site (owner idea, 4 Nov): from "I'm here" (FieldArrivedAt) to the saved outcome, kept by itself so you see how
// long a job really took. Only a same-day visit under 10 hours counts (a past-day outcome picked later is not a visit).
type Job = Record<string, unknown>;

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
const day = (ms: number) => DAY.format(new Date(ms));

export function onSiteMinutes(job: Job): number | null {
  const arrived = Date.parse(String(job.FieldArrivedAt ?? ""));
  if (!Number.isFinite(arrived)) return null;
  const history = Array.isArray(job.FieldVisitHistory) ? (job.FieldVisitHistory as { recordedAt?: string; outcome?: string | null }[]) : [];
  const done = [...history].reverse().find((h) => h && h.outcome && Number.isFinite(Date.parse(String(h.recordedAt ?? ""))));
  const end = done ? Date.parse(String(done.recordedAt)) : Date.parse(String(job.ActualWorkCompletionDate ?? ""));
  if (!Number.isFinite(end) || end <= arrived || day(end) !== day(arrived)) return null;
  const minutes = Math.round((end - arrived) / 60000);
  return minutes >= 1 && minutes <= 600 ? minutes : null;
}

export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// "⏱ 42 min on site" for the card, and the average of the other jobs timed so far when there are at least 3.
export function onSiteNote(job: Job, all: Job[]): string {
  const mine = onSiteMinutes(job);
  if (mine === null) return "";
  const others = all.filter((j) => j !== job).map(onSiteMinutes).filter((m): m is number => m !== null);
  const avg = others.length >= 3 ? Math.round(others.reduce((s, m) => s + m, 0) / others.length) : 0;
  return `⏱ ${minutesLabel(mine)} on site${avg ? ` · your usual: ${minutesLabel(avg)}` : ""}`;
}
