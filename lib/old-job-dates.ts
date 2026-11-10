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

// No access / refused on an old job (owner, 9 Nov: "for old affidavits we want to stay within the award, start and
// completion dates; that's when we have no access / refused; it could be afterwards because it's old"): an attempt
// before the award can't be (stop); attempts more than 60 days after the award are asked about, with HPD's own
// start / complete-by window offered as the two attempt days (72 hours apart). "These dates are right" lets old
// ones go after it.
export type OldAttempts = OldJobDates & { before: boolean; attempts: { first: string; second: string } | null };
export function oldAttemptCheck(input: { omo: string; award?: string; first?: string; second?: string; hpdStart?: string; hpdComplete?: string }): OldAttempts | null {
  const award = readDay(input.award);
  const a1 = readDay(input.first), a2 = readDay(input.second || input.first);
  if (!Number.isFinite(award) || !Number.isFinite(a2)) return null;
  const firstDay = Number.isFinite(a1) ? Math.min(a1, a2) : a2;
  if (firstDay < award) {
    return { key: `${input.omo}|before|${showDay(firstDay)}`, award: showDay(award), work: showDay(firstDay), months: 0, before: true, suggest: null, attempts: null,
      text: `An access attempt (${showDay(firstDay)}) can't be before the award (${showDay(award)}). Fix the date.` };
  }
  const days = Math.round((a2 - award) / DAY);
  if (days <= OLD_JOB_DAYS) return null;
  const hs = readDay(input.hpdStart), hc = readDay(input.hpdComplete);
  const start = Number.isFinite(hs) && hs >= award ? hs : award;
  const second = start + 3 * DAY;
  const attempts = (!Number.isFinite(hc) || second <= Math.max(hc, start + 3 * DAY)) && second - award <= OLD_JOB_DAYS * DAY ? { first: showDay(start), second: showDay(second) } : null;
  const months = Math.max(1, Math.round(days / 30.4));
  return {
    key: `${input.omo}|${showDay(Number.isFinite(a1) ? a1 : a2)}|${showDay(a2)}`,
    award: showDay(award), work: showDay(a2), months, before: false, suggest: null, attempts,
    text: `This job was awarded ${showDay(award)}, but the last access attempt says ${showDay(a2)} (${months} month${months === 1 ? "" : "s"} later). Were the attempts really then?`,
  };
}
