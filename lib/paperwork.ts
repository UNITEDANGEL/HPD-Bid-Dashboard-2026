export type PaperworkOutcome =
  | "pending"
  | "work_completed"
  | "no_access"
  | "refused_access"
  | "completed_by_others";

export type PaperworkJob = Record<string, unknown>;

export const PAPERWORK_OUTCOMES: { value: PaperworkOutcome; label: string }[] = [
  { value: "work_completed", label: "Work Completed" },
  { value: "no_access", label: "No Work Completed - No Access" },
  { value: "refused_access", label: "No Work Completed - Refused Access" },
  { value: "completed_by_others", label: "No Work Completed - Completed by Others" },
  { value: "pending", label: "Pending / choose on map" },
];

function pick(job: PaperworkJob | null | undefined, keys: string[]) {
  if (!job) return "";

  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

export function getJobId(job: PaperworkJob | null | undefined, fallback = "") {
  return pick(job, ["OMO", "omo", "id", "jobId", "Job_ID", "Job ID"]) || fallback;
}

export function getJobAddress(job: PaperworkJob | null | undefined) {
  return pick(job, [
    "address",
    "BuildingAddress",
    "Building_Address",
    "Building Address",
    "Address",
    "location",
    "Location",
  ]);
}

export function getJobLocation(job: PaperworkJob | null | undefined) {
  return pick(job, ["Location", "location", "ApartmentUnit", "Apartment", "Unit"]);
}

export function getJobBorough(job: PaperworkJob | null | undefined) {
  return pick(job, ["borough", "Borough", "Boro", "boro"]);
}

export function getJobDescription(job: PaperworkJob | null | undefined) {
  return pick(job, [
    "description",
    "JobDescription",
    "Job_Description",
    "Job Description",
    "Description",
    "WorkDescription",
    "ScopeOfWork",
    "Trade",
    "trade",
  ]);
}

export function getJobAmount(job: PaperworkJob | null | undefined) {
  return pick(job, [
    "AwardAmount",
    "awardAmount",
    "Award Amount",
    "bidAmount",
    "BidAmount",
    "Bid Amount",
    "Amount",
    "amountValue",
  ]);
}

export function getJobDate(job: PaperworkJob | null | undefined, kind: "start" | "complete" | "award") {
  if (kind === "start") return pick(job, ["WorkStartDate", "workStartDate", "Work Start Date"]);
  if (kind === "complete") return pick(job, ["WorkCompletionDate", "workCompletionDate", "Work Completion Date"]);
  return pick(job, ["AwardDate", "awardDate", "Award Date"]);
}

export function formatCurrency(value: string | number | undefined | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return raw;

  return parsed.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function paperworkOutcomeFromValue(value: unknown): PaperworkOutcome {
  const raw = String(value || "").toLowerCase().trim();

  if (!raw) return "pending";
  if (raw.includes("refused")) return "refused_access";
  if (raw.includes("no_access") || raw.includes("no access")) return "no_access";
  if (raw.includes("completed_by_others") || raw.includes("completed by other") || raw.includes("completed by others")) {
    return "completed_by_others";
  }
  if (raw.includes("work_completed") || raw.includes("work completed") || raw === "completed") return "work_completed";

  return "pending";
}

export function paperworkOutcomeFromJob(job: PaperworkJob | null | undefined): PaperworkOutcome {
  return paperworkOutcomeFromValue(
    pick(job, ["WorkflowStatus", "workflowStatus", "FieldOutcome", "fieldOutcome", "StatusOverride", "status", "ITBMatchStatus"])
  );
}

export function paperworkOutcomeLabel(outcome: PaperworkOutcome) {
  return PAPERWORK_OUTCOMES.find((item) => item.value === outcome)?.label || "Pending / choose on map";
}

export function affidavitTemplateLabel(outcome: PaperworkOutcome) {
  if (outcome === "work_completed") return "Work Completed Affidavit";
  if (outcome === "no_access" || outcome === "refused_access" || outcome === "completed_by_others") {
    return "No Work Completed Affidavit";
  }
  return "Choose outcome before affidavit";
}

export function invoiceDescriptionForOutcome(job: PaperworkJob | null | undefined, outcome: PaperworkOutcome) {
  const description = getJobDescription(job);

  if (outcome === "no_access") {
    return "No work completed. No access documented after required attempts. See no work completed affidavit.";
  }

  if (outcome === "refused_access") {
    return "No work completed. Access refused by occupant/representative. See no work completed affidavit.";
  }

  if (outcome === "completed_by_others") {
    return "No work completed by contractor. Condition was completed by others. See no work completed affidavit.";
  }

  if (outcome === "work_completed") {
    return description || "Work completed per HPD bid / work order.";
  }

  return description || "Select a field outcome on the map before final paperwork.";
}

export function affidavitReasonForOutcome(outcome: PaperworkOutcome) {
  if (outcome === "no_access") return "NO ACCESS";
  if (outcome === "refused_access") return "REFUSED ACCESS";
  if (outcome === "completed_by_others") return "WORK COMPLETED BY OTHERS";
  if (outcome === "work_completed") return "WORK COMPLETED";
  return "PENDING FIELD OUTCOME";
}

export function paperworkQuery(job: PaperworkJob | null | undefined, outcome?: PaperworkOutcome) {
  const params = new URLSearchParams();
  const id = getJobId(job);

  if (id) params.set("job", id);
  params.set("outcome", outcome || paperworkOutcomeFromJob(job));

  return params.toString();
}
