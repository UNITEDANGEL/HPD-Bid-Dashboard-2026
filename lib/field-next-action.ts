export type FieldStamps = { arrived?: string; visit?: string; work?: string; status?: string };

export function nextFieldAction(stamps: FieldStamps, media: { before: number; after: number }, status = "") {
  const outcome = `${stamps.status || status}`.toLowerCase().replaceAll("_", " ");
  if (/appointment|scheduled/.test(outcome)) return { key: "record", label: "Review visit notes" } as const;
  if (/refused|no access|completed|partial|appointment|scheduled|archived|cancelled/.test(outcome) && !/not completed/.test(outcome)) {
    return { key: "review", label: "Review outcome & paperwork" } as const;
  }
  if (!stamps.arrived) return { key: "arrived", label: "I have arrived" } as const;
  if (!stamps.visit) return { key: "visit", label: "Start visit" } as const;
  if (!media.before && !stamps.work) return { key: "before", label: "Add before photos" } as const;
  if (!stamps.work) return { key: "work", label: "Start work" } as const;
  if (!media.after) return { key: "after", label: "Add after photos" } as const;
  return { key: "record", label: "Record outcome" } as const;
}

// Opening the editor is navigation only: no guessed outcome, timestamps, or auto-generation.
export function paperworkReviewHref(id: string, media = true) {
  return `/paperwork?${new URLSearchParams({ job: id, media: media ? "all" : "none" })}`;
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
  }
  return patch;
}
