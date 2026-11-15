// Say why there is no photo (idea, 14 Nov): when the robot warns about a missing after photo, one tap saves a reason on the job.
export const PHOTO_REASONS = [
  { id: "no-access", label: "No access", text: "no access" },
  { id: "tenant-refused", label: "Tenant refused", text: "tenant refused" },
] as const;

export function photoReasonNote(reasonId: string, at: Date = new Date()): string {
  const r = PHOTO_REASONS.find((x) => x.id === reasonId);
  if (!r) return "";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(at);
  return `No after photo (${day}): ${r.text}.`;
}

// The newest saved reason on a job's notes, or "".
export function savedPhotoReason(notes: { text?: string }[] | null | undefined): string {
  const list = (Array.isArray(notes) ? notes : []).map((n) => String(n?.text || "")).filter((t) => /^No after photo \(/.test(t));
  return list.length ? list[list.length - 1] : "";
}
