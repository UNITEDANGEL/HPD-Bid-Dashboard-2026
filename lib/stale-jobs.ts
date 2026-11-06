// 🧹 Old jobs off the map (owner, 6 Nov: "many jobs are already closed out, I still see them on the map, I shouldn't
// see them. ER02772 is one example"). A job still "pending" in the app 21+ days after its completion date, with no
// visit, no appointment and no paperwork on record, is most likely closed out already (HPD's open data lags). It
// leaves the everyday map and waits in the 🧹 list: ✅ Closed (archived, off the map for good) or 📌 Keep (back on).
// Jobs on a notice are never hidden.

type Job = Record<string, unknown>;
const DAY = 86400000;

// "9/17/26" / "09/17/2026" / "2026-09-17" -> ms (noon UTC), 0 when unknown.
export function usDay(v: unknown) {
  const t = String(v || "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return Date.UTC(y, Number(m[1]) - 1, Number(m[2]), 12); }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : 0;
}

const yes = (v: unknown) => v === true || v === 1 || /^(true|1)$/i.test(String(v ?? ""));

export function isStaleJob(job: Job, queue: string, now = Date.now(), onNotice = false) {
  if (queue !== "pending" || onNotice || yes(job.KeepOnMap)) return false;
  const history = Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : [];
  if (history.length || job.Appointment || job.LastFieldVisitAt || job.NoAccessFirstAttemptAt || job.PaperworkSentAt) return false;
  const end = usDay(job.WorkCompletionDate) || (usDay(job.AwardDate) ? usDay(job.AwardDate) + 14 * DAY : 0);
  return !!end && now - end > 21 * DAY;
}
