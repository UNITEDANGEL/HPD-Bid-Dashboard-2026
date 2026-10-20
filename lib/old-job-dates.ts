// Old-job date check (owner, 20 Oct 2026, after EP27382: awarded 5/21/2025, paperwork went out with 2026 dates and
// vendor tracking asked to confirm the completion date): when the work date on the paperwork is long after the award,
// the paperwork page stops and asks, offering HPD's own start / complete-by dates. Nothing is changed by itself.

export const OLD_JOB_DAYS = 60; // work done more than 60 days after the award: check it

const DAY = 86400000;
// "05/28/2025", "5/28/25", "2025-05-28" or an ISO time -> a UTC midnight time (NaN if unreadable).
export function readDay(value: string | undefined | null) {
  const v = String(value || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return Date.UTC(y, Number(m[1]) - 1, Number(m[2])); }
  const t = Date.parse(v);
  return Number.isFinite(t) ? Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate()) : NaN;
}
export const showDay = (t: number) => { const d = new Date(t); return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`; };

export type OldJobDates = {
  key: string;                 // job + the dates checked (a "they're right" answer only covers these dates)
  award: string; work: string; // MM/DD/YYYY
  months: number;              // how long after the award
  text: string;
  suggest: { start: string; complete: string } | null; // HPD's start / complete-by dates, when they make sense
};

export function oldJobDateCheck(input: { omo: string; award?: string; start?: string; complete?: string; hpdStart?: string; hpdComplete?: string }): OldJobDates | null {
  const award = readDay(input.award);
  const done = readDay(input.complete || input.start);
  if (!Number.isFinite(award) || !Number.isFinite(done)) return null;
  const days = Math.round((done - award) / DAY);
  if (days <= OLD_JOB_DAYS) return null;
  const hs = readDay(input.hpdStart), hc = readDay(input.hpdComplete);
  const suggest = Number.isFinite(hs) && Number.isFinite(hc) && hs >= award && hc >= hs && hc - award <= OLD_JOB_DAYS * DAY ? { start: showDay(hs), complete: showDay(hc) } : null;
  const months = Math.max(1, Math.round(days / 30.4));
  return {
    key: `${input.omo}|${showDay(readDay(input.start || input.complete))}|${showDay(done)}`,
    award: showDay(award), work: showDay(done), months,
    text: `This job was awarded ${showDay(award)}, but the work date says ${showDay(done)} (${months} month${months === 1 ? "" : "s"} later). Was the work really done then?`,
    suggest,
  };
}
