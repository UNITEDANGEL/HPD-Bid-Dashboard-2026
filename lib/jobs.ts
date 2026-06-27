import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { JobRecord } from "./types";

let publicJobRows: Array<Record<string, unknown>> | null = null;
let publicJobOverlay: Map<string, Record<string, unknown>> | null = null;

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function readPublicJobRows() {
  if (publicJobRows) return publicJobRows;

  publicJobRows = [];
  const jsonPath = path.resolve(process.cwd(), "public", "data", "COA_Fetcher_2026.json");
  if (!fs.existsSync(jsonPath)) return publicJobRows;

  try {
    const rows = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    if (Array.isArray(rows)) {
      publicJobRows = rows.filter((row) => row && typeof row === "object") as Array<Record<string, unknown>>;
    }
  } catch {
    publicJobRows = [];
  }

  return publicJobRows;
}

function readPublicJobOverlay() {
  if (publicJobOverlay) return publicJobOverlay;

  publicJobOverlay = new Map();
  readPublicJobRows().forEach((row) => {
    const key = stringValue(row?.OMO || row?.id || row?.omo);
    if (key) publicJobOverlay!.set(key.toLowerCase(), row);
  });

  return publicJobOverlay;
}

function stringifyRecord(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, stringValue(value)])) as Record<string, string>;
}

function csvRows() {
  try {
    const csvPath = resolveCsvPath();
    const csvText = fs.readFileSync(csvPath, "utf-8");
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    return (parsed.data ?? []) as Record<string, string>[];
  } catch {
    if (readPublicJobRows().length) return [];
    throw new Error(`Required CSV not found. Checked: ${csvCandidates().join(" | ")}`);
  }
}

function normalizeAllJobs(csvData: Record<string, string>[]) {
  const normalized = csvData.map((row, index) => normalizeJob(row, index));
  const seen = new Set(normalized.map((job) => job.id.toLowerCase()));

  readPublicJobRows().forEach((row) => {
    const id = stringValue(row.OMO || row.id || row.omo);
    if (!id || seen.has(id.toLowerCase())) return;
    normalized.push(normalizeJob(stringifyRecord(row), normalized.length));
    seen.add(id.toLowerCase());
  });

  return normalized;
}

function publicFieldValue(overlay: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(overlay[key]);
    if (value) return value;
  }
  return "";
}

function pickWithOverlay(row: Record<string, string>, overlay: Record<string, unknown>, keys: string[]) {
  return pick(row, keys) || publicFieldValue(overlay, keys);
}

function pickRawOverlay(overlay: Record<string, unknown>) {
  try {
    return Object.fromEntries(Object.entries(overlay).map(([key, value]) => [key, stringValue(value)]));
  } catch {
    publicJobOverlay = new Map();
    return {};
  }
}

function parseAmount(value: string) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvCandidates() {
  return [
    path.resolve(process.cwd(), "data", "merged_job_data.csv"),
    path.resolve(process.cwd(), "..", "..", "Samples", "Merged Data", "merged_job_data.csv"),
    path.resolve(process.cwd(), "..", "..", "Fetcher_Output", "COA_Fetcher_2026.csv"),
  ];
}

function resolveCsvPath() {
  const csvPath = csvCandidates().find((candidate) => fs.existsSync(candidate));
  if (!csvPath) {
    throw new Error(`Required CSV not found. Checked: ${csvCandidates().join(" | ")}`);
  }
  return csvPath;
}

function normalizeJob(row: Record<string, string>, index: number): JobRecord {
  const id = pick(row, ["OMO", "Job ID", "job_id", "id", "omo", "EQ No", "eq_no"]) || `JOB-${index + 1}`;
  const overlay = readPublicJobOverlay().get(id.toLowerCase()) || {};
  const borough = pickWithOverlay(row, overlay, ["Borough", "Boro", "borough", "County", "county"]);
  const status = pickWithOverlay(row, overlay, ["Status", "status", "job_status", "Job Status", "state"]) || "Pending";
  const address = pick(row, [
    "BuildingAddress",
    "Building Address",
    "Address",
    "address",
    "Property Address",
    "property_address",
    "Location",
    "location",
    "Building Address",
    "building_address",
    "Property",
    "property",
  ]) || publicFieldValue(overlay, [
    "BuildingAddress",
    "Building Address",
    "Address",
    "address",
    "Location",
    "location",
  ]);
  const trade = pickWithOverlay(row, overlay, ["Trade", "Trade_Summary", "trade", "trade_summary"]);
  const awardDate = pickWithOverlay(row, overlay, ["AwardDate", "Award_Date", "AwardDate_dt"]);
  const bidAmount = pickWithOverlay(row, overlay, ["BidAmount", "AwardAmount", "Award_Amount", "bid_amount"]);
  const description = pickWithOverlay(row, overlay, [
    "DescriptionOfWork",
    "FullDescription",
    "Description",
    "Summary",
    "JobDescription",
  ]);
  const tenantName = pickWithOverlay(row, overlay, ["TenantName", "Tenant", "tenant_name"]);
  const tenantPhone = pickWithOverlay(row, overlay, ["TenantPhone", "Phone", "phone"]);
  const itbTenantName = stringValue(overlay.ItbTenantName);
  const itbTenantPhone = stringValue(overlay.ItbTenantPhone);
  const itbTenantAppointmentNeeded = overlay.ItbTenantAppointmentNeeded === true || overlay.ItbTenantAppointmentNeeded === "true";
  const location = pickWithOverlay(row, overlay, ["Location", "location"]);
  const latitude = pickWithOverlay(row, overlay, ["Latitude", "latitude"]);
  const longitude = pickWithOverlay(row, overlay, ["Longitude", "longitude"]);
  const coaFile = pickWithOverlay(row, overlay, ["COAFile", "COA_File", "coaFile", "coa_file"]);
  const itbFile = pickWithOverlay(row, overlay, ["ITBFile", "ITB_File", "itbFile", "itb_file"]);

  return {
    id,
    borough,
    status,
    address,
    trade,
    awardDate,
    bidAmount,
    amountValue: parseAmount(bidAmount),
    description,
    tenantName,
    tenantPhone,
    itbTenantAccessType: stringValue(overlay.ItbTenantAccessType),
    itbTenantAppointmentNeeded,
    itbTenantApartment: stringValue(overlay.ItbTenantApartment),
    itbTenantName,
    itbTenantPhone,
    itbTenantContactStatus: stringValue(overlay.ItbTenantContactStatus),
    location,
    latitude,
    longitude,
    hasMap: Boolean(latitude && longitude),
    coaFile,
    itbFile,
    raw: { ...row, ...pickRawOverlay(overlay) },
  };
}

export function getJobs(): JobRecord[] {
  return normalizeAllJobs(csvRows());
}

export function getJobById(id: string) {
  return getJobs().find((job) => job.id.toLowerCase() === id.toLowerCase()) ?? null;
}
