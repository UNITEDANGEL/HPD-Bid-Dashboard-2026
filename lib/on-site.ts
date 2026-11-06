// 🔨 Working here now (owner, 6 Nov, at ER07610: "we are on location, working at this job ... keep track of the time
// also ... upgrade the map so I can see that we are in work in progress here right now ... it needs to get recorded on
// the job card for good"). A job you arrived at today with no outcome saved since is the one you're working on; the
// time on site counts from the arrival. Saved on the job (the status server), so the computer's map shows it too:
// the job, never your live position.

type Job = Record<string, unknown>;
const t = (v: unknown) => { const n = Date.parse(String(v || "")); return Number.isFinite(n) ? n : 0; };
const nyDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));

export function onSite(job: Job, now = Date.now()): { since: number; minutes: number } | null {
  const since = t(job.FieldArrivedAt || job.fieldArrivedAt);
  if (!since || nyDay(since) !== nyDay(now) || now - since > 14 * 3600000 || since > now + 60000) return null;
  // An outcome saved after the arrival (work completed, no access, ...) ends the visit.
  const ended = Math.max(t(job.OutcomeLockedAt || job.outcomeLockedAt), t(job.OnSiteEndedAt), t(job.ArchivedAt));
  if (ended >= since && /./.test(String(job.FieldOutcome || job.fieldOutcome || job.OnSiteEndedAt || job.ArchivedAt || ""))
    && !/^(VISIT_STARTED|WORK_STARTED)$/.test(String(job.FieldOutcome || job.fieldOutcome || ""))) return null;
  return { since, minutes: Math.max(0, Math.round((now - since) / 60000)) };
}

export const duration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`);
export const clockAt = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

// The line kept on the job when the visit ends: "On site 2:10 PM – 3:45 PM (1 h 35 min)".
export function onSiteRecord(since: number, end: number) {
  return `On site ${clockAt(since)} – ${clockAt(end)} (${duration(Math.max(0, Math.round((end - since) / 60000)))})`;
}
