// Don't leave without the after photo (owner idea, 4 Nov): you tapped "I'm here" today, no outcome is saved yet, there is
// no after photo, and the phone is now more than 150 m from the job. The app speaks up once for that job.
type Job = Record<string, unknown>;

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
export const LEAVE_METERS = 150;

export function leftWithoutAfterPhoto(job: Job, afterCount: number, meters: number, now = Date.now()): boolean {
  const arrived = Date.parse(String(job.FieldArrivedAt ?? ""));
  if (!Number.isFinite(arrived) || now < arrived || now - arrived > 10 * 3600000) return false;
  if (DAY.format(new Date(arrived)) !== DAY.format(new Date(now))) return false;
  if (afterCount > 0 || String(job.FieldOutcome ?? job.fieldOutcome ?? "").trim()) return false;
  const history = Array.isArray(job.FieldVisitHistory) ? (job.FieldVisitHistory as { recordedAt?: string; outcome?: string | null }[]) : [];
  if (history.some((h) => h && h.outcome && Date.parse(String(h.recordedAt ?? "")) >= arrived)) return false;
  return meters > LEAVE_METERS;
}
