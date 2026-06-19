export type JobStatusKind =
  | "none"
  | "completed"
  | "refused"
  | "noaccess1"
  | "noaccess2"
  | "otherdone"
  | "pending";

export function statusText(job: any) {
  return String(
    job?.StatusOverride ||
    job?.status ||
    job?.ITBMatchStatus ||
    job?.COAParseStatus ||
    ""
  ).trim();
}

export function statusKind(job: any): JobStatusKind {
  const value = statusText(job).toLowerCase();

  if (!value || value === "matched" || value === "ok" || value === "loaded") return "none";

  if (value.includes("refused")) return "refused";

  if (value.includes("no access") && value.includes("2")) return "noaccess2";
  if (value.includes("no access")) return "noaccess1";

  if (
    value.includes("completed by other") ||
    value.includes("completed by others") ||
    value.includes("owner completed") ||
    value.includes("landlord")
  ) {
    return "otherdone";
  }

  if (value.includes("complete") || value.includes("work completed")) return "completed";

  return "pending";
}

export function statusLabel(job: any) {
  return statusText(job) || "No status update";
}

export function statusCardClass(job: any) {
  return `status-card-${statusKind(job)}`;
}

export function statusMarkerClass(job: any) {
  return `status-marker-${statusKind(job)}`;
}

export function statusColor(job: any) {
  const kind = statusKind(job);

  if (kind === "completed") return "#53e69c";
  if (kind === "refused") return "#ff4d5f";
  if (kind === "noaccess1") return "#7f93aa";
  if (kind === "noaccess2") return "#05070b";
  if (kind === "otherdone") return "#b875ff";
  if (kind === "pending") return "#ffd166";

  return "#42e8f3";
}
