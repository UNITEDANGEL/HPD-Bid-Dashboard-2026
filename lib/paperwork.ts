export type PaperworkOutcome =
  | "pending"
  | "work_completed"
  | "partial_work_completed"
  | "no_access"
  | "refused_access"
  | "completed_by_others";

export type PaperworkJob = Record<string, unknown>;
export type WorkflowOverrides = Record<string, Record<string, unknown>>;

export const HPD_STATUS_WORKER_URL = "https://hpd-status-worker.uac525.workers.dev";
export const NO_WORK_SERVICE_CHARGE = 100;
export const NO_WORK_LARGE_SERVICE_CHARGE = 300;
export const NO_WORK_LARGE_JOB_THRESHOLD = 2000;

const WORKFLOW_STORAGE_KEYS = ["hpd-job-workflow-overrides-v2", "hpd-job-workflow-overrides-v1"];

export const PAPERWORK_OUTCOMES: { value: PaperworkOutcome; label: string }[] = [
  { value: "work_completed", label: "Work Completed" },
  { value: "partial_work_completed", label: "Partial Work Completed" },
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

function parseOverridePayload(value: unknown): WorkflowOverrides {
  let payload = value;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {};
    }
  }

  if (!payload || typeof payload !== "object") return {};

  const source = payload as Record<string, unknown>;
  const overrides =
    source.overrides && typeof source.overrides === "object"
      ? (source.overrides as Record<string, unknown>)
      : source;

  return Object.fromEntries(
    Object.entries(overrides).filter((entry): entry is [string, Record<string, unknown>] => {
      const [, patch] = entry;
      return Boolean(patch) && typeof patch === "object" && !Array.isArray(patch);
    })
  );
}

function clearedWorkflowPatch() {
  return {
    WorkflowStatus: "",
    workflowStatus: "",
    FieldOutcome: "",
    fieldOutcome: "",
    StatusOverride: "",
    status: "Pending",
    NoAccessFirstAttemptAt: "",
    noAccessFirstAttemptAt: "",
    NoAccessSecondAttemptAt: "",
    noAccessSecondAttemptAt: "",
    SecondAttemptAvailableAt: "",
    secondAttemptAvailableAt: "",
    RefusalDate: "",
    refusalDate: "",
    VerifiedByOthersDate: "",
    verifiedByOthersDate: "",
    ActualWorkStartDate: "",
    actualWorkStartDate: "",
    ActualWorkCompletionDate: "",
    actualWorkCompletionDate: "",
    OutcomeLockedAt: "",
    outcomeLockedAt: "",
    ArchivedFromMap: false,
  };
}

export function getJobId(job: PaperworkJob | null | undefined, fallback = "") {
  return pick(job, ["OMO", "omo", "id", "jobId", "Job_ID", "Job ID"]) || fallback;
}

export function getJobWorkflowStatus(job: PaperworkJob | null | undefined) {
  return pick(job, ["WorkflowStatus", "workflowStatus", "FieldOutcome", "fieldOutcome", "StatusOverride", "status"]);
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

export function amountToNumber(value: string | number | undefined | null) {
  const parsed = Number(String(value ?? "").replace(/[$,\s()]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function noWorkServiceChargeForAmount(value: string | number | undefined | null) {
  return amountToNumber(value) >= NO_WORK_LARGE_JOB_THRESHOLD
    ? NO_WORK_LARGE_SERVICE_CHARGE
    : NO_WORK_SERVICE_CHARGE;
}

export function noWorkServiceChargeForJob(job: PaperworkJob | null | undefined) {
  return noWorkServiceChargeForAmount(getJobAmount(job));
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
  if (raw.includes("no_access_1") || raw.includes("waiting_72h") || raw.includes("waiting 72")) return "no_access";
  if (raw.includes("no_access_complete")) return "no_access";
  if (raw.includes("partial_work_completed") || raw.includes("partial work completed")) return "partial_work_completed";
  if (raw.includes("work_completed")) return "work_completed";
  if (raw.includes("refused_access")) return "refused_access";
  if (raw.includes("completed_by_others")) return "completed_by_others";
  if (raw.includes("refused")) return "refused_access";
  if (raw.includes("no_access") || raw.includes("no access")) return "no_access";
  if (raw.includes("completed_by_others") || raw.includes("completed by other") || raw.includes("completed by others")) {
    return "completed_by_others";
  }
  if (raw.includes("work_completed") || raw.includes("work completed") || raw === "completed") return "work_completed";

  return "pending";
}

export function paperworkOutcomeFromJob(job: PaperworkJob | null | undefined): PaperworkOutcome {
  return paperworkOutcomeFromValue(getJobWorkflowStatus(job) || pick(job, ["ITBMatchStatus"]));
}

export function paperworkOutcomeLabel(outcome: PaperworkOutcome) {
  return PAPERWORK_OUTCOMES.find((item) => item.value === outcome)?.label || "Pending / choose on map";
}

export function isNoWorkOutcome(outcome: PaperworkOutcome) {
  return outcome === "no_access" || outcome === "refused_access" || outcome === "completed_by_others";
}

export function defaultPaperworkInvoiceNo(jobId = "") {
  const digits = String(jobId || "").match(/\d+/)?.[0] || "";
  if (digits) return `Q${digits}`;
  return `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
}

export function affidavitTemplateLabel(outcome: PaperworkOutcome) {
  if (outcome === "work_completed" || outcome === "partial_work_completed") return "Work Completed Affidavit";
  if (isNoWorkOutcome(outcome)) return "No Work Completed Affidavit";
  return "Choose outcome before affidavit";
}

export function invoiceDescriptionForOutcome(job: PaperworkJob | null | undefined, outcome: PaperworkOutcome) {
  const description = getJobDescription(job);

  if (outcome === "no_access") {
    return "***************************NO ACCESS******************************************";
  }

  if (outcome === "refused_access") {
    return "***********************REFUSED ACCESS***************************************";
  }

  if (outcome === "completed_by_others") {
    return "***********************WORK COMPLETED BY OTHERS***************************";
  }

  if (outcome === "work_completed" || outcome === "partial_work_completed") {
    return description || "Work completed per HPD bid / work order.";
  }

  return description || "Select a field outcome on the map before final paperwork.";
}

export function affidavitReasonForOutcome(outcome: PaperworkOutcome) {
  if (outcome === "no_access") return "NO ACCESS";
  if (outcome === "refused_access") return "REFUSED ACCESS";
  if (outcome === "completed_by_others") return "WORK COMPLETED BY OTHERS";
  if (outcome === "partial_work_completed") return "PARTIAL WORK COMPLETED";
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

export function readLocalWorkflowOverrides(): WorkflowOverrides {
  if (typeof window === "undefined") return {};

  return WORKFLOW_STORAGE_KEYS.reduce<WorkflowOverrides>((merged, key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return merged;
      return { ...merged, ...parseOverridePayload(raw) };
    } catch {
      return merged;
    }
  }, {});
}

export async function fetchServerWorkflowOverrides(): Promise<WorkflowOverrides> {
  try {
    const response = await fetch(`${HPD_STATUS_WORKER_URL}/overrides`, { cache: "no-store" });
    if (!response.ok) return {};
    return parseOverridePayload(await response.json());
  } catch {
    return {};
  }
}

export function applyWorkflowOverridesToRows<T extends PaperworkJob>(rows: T[], overrides: WorkflowOverrides): T[] {
  return rows.map((row, index) => {
    const key = getJobId(row, `JOB-${index + 1}`);
    const patch = key ? overrides[key] : null;

    if (!patch) return row;
    if (patch.__clearWorkflow) return { ...row, ...clearedWorkflowPatch() } as T;

    return { ...row, ...patch } as T;
  });
}

export async function applySavedWorkflowStatuses<T extends PaperworkJob>(rows: T[]): Promise<T[]> {
  const local = readLocalWorkflowOverrides();
  const server = await fetchServerWorkflowOverrides();
  const overrides = { ...local, ...server };

  return applyWorkflowOverridesToRows(rows, overrides);
}
