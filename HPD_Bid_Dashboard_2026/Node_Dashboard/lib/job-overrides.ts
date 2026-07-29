import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { shouldAutoArchiveStatus } from "./workflow";

export type JobOverride = {
  RowID: string;
  OMO: string;
  StatusOverride: string;
  WorkflowStatus: string;
  FieldOutcome: string;
  RefusalDate: string;
  NoAccessFirstAttemptAt: string;
  SecondAttemptAvailableAt: string;
  NoAccessSecondAttemptAt: string;
  VerifiedByOthersDate: string;
  ActualWorkStartDate: string;
  ActualWorkCompletionDate: string;
  WorkStartDateOverride: string;
  WorkCompletionDateOverride: string;
  ArchivedFromMap: string;
  UpdatedAt: string;
};

export type JobOverrideInput = {
  id: string;
  status?: string;
  archived?: boolean;
};

export const OVERRIDE_HEADERS = [
  "RowID",
  "OMO",
  "StatusOverride",
  "WorkflowStatus",
  "FieldOutcome",
  "RefusalDate",
  "NoAccessFirstAttemptAt",
  "SecondAttemptAvailableAt",
  "NoAccessSecondAttemptAt",
  "VerifiedByOthersDate",
  "ActualWorkStartDate",
  "ActualWorkCompletionDate",
  "WorkStartDateOverride",
  "WorkCompletionDateOverride",
  "ArchivedFromMap",
  "UpdatedAt",
] as const;

export function overridesPath() {
  return path.resolve(process.cwd(), "data", "status_overrides_2026.csv");
}

function blankOverride(): JobOverride {
  return Object.fromEntries(OVERRIDE_HEADERS.map((header) => [header, ""])) as JobOverride;
}

function normalizeId(value: string) {
  return String(value || "").trim().toLowerCase();
}

function rowIdCandidate(row: Partial<JobOverride>) {
  const rowId = String(row.RowID || "").trim();
  if (!rowId) return "";
  return rowId.split("|")[0]?.trim() || rowId;
}

function matchesOverride(row: Partial<JobOverride>, id: string) {
  const target = normalizeId(id);
  return normalizeId(row.OMO || "") === target || normalizeId(rowIdCandidate(row)) === target;
}

export function normalizeWorkflowStatus(status: string) {
  return String(status || "Pending")
    .trim()
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function readOverrides(): JobOverride[] {
  const filePath = overridesPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const parsed = Papa.parse(fs.readFileSync(filePath, "utf-8"), {
    header: true,
    skipEmptyLines: true,
  });

  return ((parsed.data || []) as Partial<JobOverride>[]).map((row) => {
    const normalized = blankOverride();
    for (const header of OVERRIDE_HEADERS) {
      normalized[header] = String(row[header] || "");
    }
    return normalized;
  });
}

export function getOverrideForJob(id: string, overrides = readOverrides()) {
  return overrides.find((row) => matchesOverride(row, id)) || null;
}

export function effectiveStatus(originalStatus: string, override: Partial<JobOverride> | null) {
  const status = override?.StatusOverride || override?.FieldOutcome || originalStatus;
  return String(status || "Pending").trim();
}

export function isArchived(override: Partial<JobOverride> | null) {
  return String(override?.ArchivedFromMap || "").trim().toLowerCase() === "true";
}

export function upsertOverride(input: JobOverrideInput) {
  const id = String(input.id || "").trim();
  if (!id) {
    throw new Error("Missing job id");
  }

  const rows = readOverrides();
  let index = rows.findIndex((row) => matchesOverride(row, id));
  if (index === -1) {
    rows.push({ ...blankOverride(), RowID: id, OMO: id });
    index = rows.length - 1;
  }

  const row = rows[index];
  row.RowID = row.RowID || id;
  row.OMO = row.OMO || id;

  let statusRequiresArchive = false;
  if (input.status !== undefined) {
    const status = String(input.status || "Pending").trim();
    row.StatusOverride = status;
    row.FieldOutcome = status;
    row.WorkflowStatus = normalizeWorkflowStatus(status);
    statusRequiresArchive = shouldAutoArchiveStatus(status);
    if (statusRequiresArchive) {
      row.ArchivedFromMap = "true";
    }
  }

  if (input.archived !== undefined && !statusRequiresArchive) {
    row.ArchivedFromMap = input.archived ? "true" : "false";
  }

  row.UpdatedAt = new Date().toISOString();
  writeOverrides(rows);
  return row;
}

export function archiveCompleted(ids: string[]) {
  const rows = readOverrides();
  const now = new Date().toISOString();
  const targets = new Set(ids.map((id) => normalizeId(id)));
  let updated = 0;

  for (const id of targets) {
    if (!id) continue;
    let index = rows.findIndex((row) => matchesOverride(row, id));
    if (index === -1) {
      rows.push({ ...blankOverride(), RowID: id, OMO: id });
      index = rows.length - 1;
    }
    rows[index].ArchivedFromMap = "true";
    rows[index].UpdatedAt = now;
    updated += 1;
  }

  writeOverrides(rows);
  return updated;
}

function writeOverrides(rows: JobOverride[]) {
  const filePath = overridesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const csv = Papa.unparse(rows, { columns: [...OVERRIDE_HEADERS] });
  fs.writeFileSync(filePath, `${csv}\n`, "utf-8");
}
