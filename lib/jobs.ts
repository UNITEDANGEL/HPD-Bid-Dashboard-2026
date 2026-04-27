import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { JobRecord } from "./types";

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
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
  const borough = pick(row, ["Borough", "Boro", "borough", "County", "county"]);
  const status = pick(row, ["Status", "status", "job_status", "Job Status", "state"]) || "Pending";
  const address = pick(row, [
    "BuildingAddress",
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
  ]);
  const trade = pick(row, ["Trade", "Trade_Summary", "trade", "trade_summary"]);
  const awardDate = pick(row, ["AwardDate", "Award_Date", "AwardDate_dt"]);
  const bidAmount = pick(row, ["BidAmount", "Award_Amount", "bid_amount"]);
  const description = pick(row, [
    "DescriptionOfWork",
    "FullDescription",
    "Description",
    "Summary",
    "JobDescription",
  ]);
  const tenantName = pick(row, ["TenantName", "Tenant", "tenant_name"]);
  const tenantPhone = pick(row, ["TenantPhone", "Phone", "phone"]);
  const location = pick(row, ["Location", "location"]);
  const latitude = pick(row, ["Latitude", "latitude"]);
  const longitude = pick(row, ["Longitude", "longitude"]);
  const coaFile = pick(row, ["COA_File", "coa_file"]);
  const itbFile = pick(row, ["ITB_File", "itb_file"]);

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
    location,
    latitude,
    longitude,
    hasMap: Boolean(latitude && longitude),
    coaFile,
    itbFile,
    raw: row,
  };
}

export function getJobs(): JobRecord[] {
  const csvPath = resolveCsvPath();
  const csvText = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return ((parsed.data ?? []) as Record<string, string>[]).map((row: Record<string, string>, index: number) =>
    normalizeJob(row, index)
  );
}

export function getJobById(id: string) {
  return getJobs().find((job) => job.id.toLowerCase() === id.toLowerCase()) ?? null;
}
