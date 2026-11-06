// 🔁 Monday paperwork sweep (plan item 32): Monday morning, once, in the brief: the jobs finished in the field whose
// paperwork hasn't gone to HPD yet, oldest first, so nothing finished sits unpaid.

type Job = Record<string, unknown>;
const FINISHED = /WORK_COMPLETED|PARTIAL_WORK|REFUSED_ACCESS|NO_ACCESS_2|COMPLETED_BY_OTHERS/;
const t = (v: unknown) => { const n = Date.parse(String(v || "")); return Number.isFinite(n) ? n : 0; };

export function paperworkLeft(jobs: Job[], sent: Record<string, { sentAt?: string }> = {}) {
  return jobs.filter((j) => {
    const id = String(j.OMO || j.id || "");
    if (!id || /^TEST/i.test(id)) return false;
    if (!FINISHED.test(String(j.FieldOutcome || j.fieldOutcome || ""))) return false;
    if (j.PaperworkSentAt || j.PackageApprovedAt || sent[id]?.sentAt) return false;
    return !/archived/i.test(String(j.status || j.StatusOverride || "")) && !j.ArchivedFromMap;
  }).map((j) => ({ id: String(j.OMO || j.id), at: t(j.OutcomeLockedAt || j.outcomeLockedAt || j.LastFieldVisitAt) }))
    .sort((a, b) => (a.at || Infinity) - (b.at || Infinity));
}

// "Monday sweep: 3 finished jobs still need their paperwork sent, oldest first: ER01234, ER05678 and EQ11111."
export function mondaySweepLine(left: { id: string }[]) {
  if (!left.length) return "";
  const ids = left.slice(0, 4).map((x) => x.id);
  const list = ids.length > 1 ? `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}` : ids[0];
  return `Monday sweep: ${left.length} finished job${left.length === 1 ? "" : "s"} still need${left.length === 1 ? "s" : ""} the paperwork sent, oldest first: ${list}${left.length > 4 ? `, and ${left.length - 4} more` : ""}.`;
}

// Monday from 8 AM (New York).
export const isMondaySweepTime = (weekday: number, hour: number) => weekday === 1 && hour >= 8;
