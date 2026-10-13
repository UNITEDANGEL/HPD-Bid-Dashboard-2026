// Locking sent paperwork. Once a job's paperwork is approved and sent to HPD (PackageApprovedAt), the
// job is locked: its outcome and the paperwork dates can't be changed by accident (outcome buttons,
// "Clear outcome", "Start over", "Got access on the 2nd try" are blocked; the paperwork page shows the
// sent version read-only). To change it -- e.g. no access was sent, then access was given later --
// "Revise paperwork" keeps the sent version in the job's PaperworkRevisions with the reason, and opens
// the job again for the new outcome and dates. The award date and HPD's contract dates never change.

type Job = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

export type PaperworkRevision = {
  revisedAt: string; reason: string;
  outcome: string; approvedAt: string; emailedAt: string; emailedTo: string; driveLink: string;
  dates: Record<string, string>;
};

export type PaperworkLock = {
  locked: boolean; approvedAt: string; emailedAt: string; emailedTo: string; driveLink: string; outcome: string;
  revisions: PaperworkRevision[];
};

// The dates on the paperwork that can be edited until it's sent (kept with each revision).
export const EDITABLE_DATE_FIELDS = [
  "ActualWorkStartDate", "ActualWorkCompletionDate", "NoAccessFirstAttemptAt", "NoAccessSecondAttemptAt",
  "RefusalDate", "VerifiedByOthersDate",
] as const;

export function paperworkLock(job: Job | null | undefined): PaperworkLock {
  const j = job || {};
  const revisions = Array.isArray(j.PaperworkRevisions) ? (j.PaperworkRevisions as PaperworkRevision[]) : [];
  const approvedAt = str(j.PackageApprovedAt) || (/approved/i.test(str(j.PackageReviewStatus)) ? str(j.PackageGeneratedAt) || "approved" : "");
  return {
    locked: Boolean(approvedAt),
    approvedAt,
    emailedAt: str(j.PackageEmailedAt),
    emailedTo: str(j.PackageEmailedTo),
    driveLink: str(j.PackageDriveLink),
    outcome: str(j.FieldOutcome) || str(j.WorkflowStatus) || str(j.StatusOverride),
    revisions,
  };
}

// What to tell someone who tries to change a locked job.
export function lockedMessage(id: string, lock: PaperworkLock) {
  const day = lock.approvedAt && lock.approvedAt !== "approved" ? new Date(lock.approvedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) : "";
  return `🔒 ${id}: paperwork was sent to HPD${day ? ` on ${day}` : ""}, so the job is locked. To change it, open the paperwork and tap "Revise paperwork".`;
}

// Revise: keep the sent version (outcome, dates, when and where it went) and open the job again.
export function revisionPatch(job: Job, reason: string, now = new Date().toISOString()) {
  const lock = paperworkLock(job);
  const dates: Record<string, string> = {};
  for (const key of EDITABLE_DATE_FIELDS) if (str(job[key])) dates[key] = str(job[key]);
  const revision: PaperworkRevision = {
    revisedAt: now, reason: reason.trim(),
    outcome: lock.outcome, approvedAt: lock.approvedAt, emailedAt: lock.emailedAt, emailedTo: lock.emailedTo, driveLink: lock.driveLink,
    dates,
  };
  const history = Array.isArray(job.FieldVisitHistory) ? (job.FieldVisitHistory as unknown[]) : [];
  return {
    PaperworkRevisions: [...lock.revisions, revision],
    PackageApprovedAt: "", PackageReviewStatus: "Revising", PackageEmailedAt: "",
    PackageReadyMessage: `Revising the paperwork sent ${lock.approvedAt ? lock.approvedAt.slice(0, 10) : ""}: ${revision.reason}`,
    packageReadyMessage: `Revising the paperwork sent ${lock.approvedAt ? lock.approvedAt.slice(0, 10) : ""}: ${revision.reason}`,
    FieldVisitHistory: [...history, { recordedAt: now, outcome: null, note: `Paperwork revision started (sent version kept): ${revision.reason}` }],
  };
}
