export type FieldStamps = { arrived?: string; visit?: string; work?: string; status?: string };

export function arrivalVisitPatch(now: string) {
  return { FieldArrivedAt: now, fieldArrivedAt: now, LastFieldVisitAt: now, lastFieldVisitAt: now,
    VisitStartedAt: now, visitStartedAt: now, StatusOverride: "Arrived", status: "Arrived" };
}

export function suggestedPhotoKind(stamps: FieldStamps) {
  return stamps.work ? "after" as const : "before" as const;
}

export function nextFieldAction(stamps: FieldStamps, media: { before: number; after: number }, status = "") {
  const outcome = `${stamps.status || status}`.toLowerCase().replaceAll("_", " ");
  if (/appointment|scheduled/.test(outcome)) return { key: "record", label: "Review visit notes" } as const;
  if (/refused|no access|completed|partial|appointment|scheduled|archived|cancelled/.test(outcome) && !/not completed/.test(outcome)) {
    return { key: "review", label: "Review outcome & paperwork" } as const;
  }
  if (media.after > 0) return { key: "record", label: "Record outcome & prepare package" } as const;
  // Arrived -> before photos -> after photos -> outcome -> package. Arriving starts the visit, and
  // saving the before photos records the work start, so neither is a separate step.
  if (!stamps.arrived) return { key: "arrived", label: "I have arrived" } as const;
  if (!stamps.visit) return { key: "visit", label: "Start visit" } as const;
  if (!media.before && !stamps.work) return { key: "before", label: "Add before photos" } as const;
  if (!media.after) return { key: "after", label: "Add after photos" } as const;
  return { key: "record", label: "Record outcome" } as const;
}

// Opening the editor is navigation only: no guessed outcome, timestamps, or auto-generation.
export function paperworkReviewHref(id: string, media = true) {
  return `/paperwork?${new URLSearchParams({ job: id, media: media ? "all" : "none" })}`;
}

export function paperworkGenerateHref(id: string, outcome: string) {
  const outcomes: Record<string, string> = { WORK_COMPLETED: "work_completed", PARTIAL_WORK: "partial_work_completed",
    NO_ACCESS_1_WAITING_72H: "no_access", REFUSED_ACCESS: "refused_access", WORK_COMPLETED_BY_OTHERS: "completed_by_others" };
  if (!outcomes[outcome]) throw new Error("Save a paperwork outcome first.");
  // Signed package: the paperwork page waits for the signer and the notary, builds it, and on
  // approve emails the signed copy and saves the unsigned print copy to the Drive folder.
  return `/paperwork?${new URLSearchParams({ job: id, media: "all", auto: "package", outcome: outcomes[outcome] })}`;
}

// Where the job card's paperwork buttons go: straight into the package flow once an outcome is
// saved, otherwise the paperwork page to pick one.
export function paperworkNextHref(id: string, savedOutcome: string) {
  try {
    return paperworkGenerateHref(id, savedOutcome);
  } catch {
    return paperworkReviewHref(id);
  }
}

export const FIELD_OUTCOMES: Record<string, string> = {
  WORK_COMPLETED: "Work completed",
  PARTIAL_WORK: "Partial work",
  NO_ACCESS_1_WAITING_72H: "No access",
  REFUSED_ACCESS: "Refused access",
  WORK_COMPLETED_BY_OTHERS: "Completed by others",
  APPOINTMENT_REQUESTED: "Appointment requested",
};

export function fieldOutcomePatch(job: Record<string, unknown>, outcome: string, note: string, now: string) {
  if (!FIELD_OUTCOMES[outcome] && outcome !== "") throw new Error("Select a valid outcome.");
  if (!outcome && !note.trim()) throw new Error("Select an outcome or enter a note.");
  const history = Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : [];
  const patch: Record<string, unknown> = {
    FieldVisitHistory: [...history, { recordedAt: now, outcome: outcome || null, note: note.trim() }],
  };
  if (!outcome) return patch;
  Object.assign(patch, { WorkflowStatus: outcome, FieldOutcome: outcome, StatusOverride: FIELD_OUTCOMES[outcome], status: FIELD_OUTCOMES[outcome], PackageReviewStatus: "Pending" });
  if (outcome === "WORK_COMPLETED") patch.ActualWorkCompletionDate = now;
  if (outcome === "REFUSED_ACCESS") patch.RefusalDate = now;
  if (outcome === "WORK_COMPLETED_BY_OTHERS") patch.CompletedByOthersDate = now;
  if (outcome === "NO_ACCESS_1_WAITING_72H" && !job.NoAccessFirstAttemptAt) {
    patch.NoAccessFirstAttemptAt = now;
    patch.SecondAttemptAvailableAt = new Date(new Date(now).getTime() + 72 * 60 * 60 * 1000).toISOString();
    Object.assign(patch, { StatusOverride: "No Access 1st - Waiting 72h", status: "No Access 1st - Waiting 72h" });
  } else if (outcome === "NO_ACCESS_1_WAITING_72H" && !job.NoAccessSecondAttemptAt && newYorkDay(job.NoAccessFirstAttemptAt)) {
    // The No Access affidavit needs two tries at least 72 hours apart (3 calendar days on the form).
    const second = secondTryState({ ...job, FieldOutcome: outcome }, new Date(now));
    if (second && !second.due) throw new Error(`Not saved: the 2nd no-access try counts from ${second.dueLabel} (72 hours after the 1st try on ${second.firstLabel}).`);
    Object.assign(patch, { NoAccessSecondAttemptAt: now, StatusOverride: "No Access 2nd - Ready for affidavit", status: "No Access 2nd - Ready for affidavit" });
  }
  return patch;
}

// New York calendar day (YYYY-MM-DD) of a saved time, or "".
const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
export function newYorkDay(value: unknown) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? NY_DAY.format(new Date(time)) : "";
}

function shortDayLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${String(month).padStart(2, "0")}/${String(date).padStart(2, "0")}`;
}

// A job with one no-access try waits for the 2nd: due 3 calendar days after the 1st. Null when the
// job isn't waiting (no no-access outcome, or the 2nd try is already saved).
export function secondTryState(job: Record<string, unknown>, now = new Date()) {
  const outcome = String(job.FieldOutcome || job.fieldOutcome || "");
  if (outcome !== "NO_ACCESS_1_WAITING_72H" || job.NoAccessSecondAttemptAt || job.noAccessSecondAttemptAt) return null;
  const firstDay = newYorkDay(job.NoAccessFirstAttemptAt || job.noAccessFirstAttemptAt);
  if (!firstDay) return null;
  const [year, month, date] = firstDay.split("-").map(Number);
  const dueDay = new Date(Date.UTC(year, month - 1, date + 3)).toISOString().slice(0, 10);
  return { firstDay, dueDay, due: newYorkDay(now.toISOString()) >= dueDay, firstLabel: shortDayLabel(firstDay), dueLabel: shortDayLabel(dueDay) };
}
