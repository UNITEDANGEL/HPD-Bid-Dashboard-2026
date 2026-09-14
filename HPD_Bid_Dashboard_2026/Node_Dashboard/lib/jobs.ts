import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { effectiveStatus, getOverrideForJob, isArchived, readOverrides } from "./job-overrides";
import type { JobRecord } from "./types";

type SourceRow = Record<string, unknown>;

function uniquePaths(values: string[]) {
  return Array.from(new Set(values.filter(Boolean).map((value) => path.resolve(value))));
}

function envPath(name: string) {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : "";
}

export function fetcherRootCandidates() {
  return uniquePaths([
    envPath("HPD_FETCHER_ROOT"),
    path.resolve(process.cwd(), "..", "..", ".automation-hpd-20260814-1301"),
  ]);
}

function fetcherDataDirCandidates() {
  return uniquePaths([
    envPath("HPD_JOBS_DATA_DIR"),
    ...fetcherRootCandidates().flatMap((root) => [
      path.resolve(root, "data"),
      path.resolve(root, "public", "data"),
    ]),
  ]);
}

function newestExistingPath(candidates: string[]) {
  return candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({ candidate, updatedAt: fs.statSync(candidate).mtimeMs }))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.candidate;
}

function pick(row: SourceRow, keys: string[]) {
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

function cleanSourceValue(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";

  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  if (["john doe", "tenant name", "not available", "n/a", "na", "none", "null", "unknown"].includes(normalized)) {
    return "";
  }

  return text;
}

export function csvCandidates() {
  return uniquePaths([
    envPath("HPD_JOBS_CSV_PATH"),
    ...fetcherDataDirCandidates().map((dir) => path.resolve(dir, "COA_Fetcher_2026.csv")),
    path.resolve(process.cwd(), "data", "COA_Fetcher_2026.csv"),
    path.resolve(process.cwd(), "public", "data", "COA_Fetcher_2026.csv"),
    path.resolve(process.cwd(), "..", "Fetcher_Output", "HPD_Bid_Fetcher_Master_2026.csv"),
    path.resolve(process.cwd(), "data", "merged_job_data.csv"),
    path.resolve(process.cwd(), "..", "..", "Samples", "Merged Data", "merged_job_data.csv"),
    path.resolve(process.cwd(), "..", "..", "Fetcher_Output", "HPD_Bid_Fetcher_Master_2026.csv"),
  ]);
}

export function jsonCandidates() {
  return uniquePaths([
    envPath("HPD_JOBS_JSON_PATH"),
    ...fetcherDataDirCandidates().map((dir) => path.resolve(dir, "COA_Fetcher_2026.json")),
    path.resolve(process.cwd(), "data", "COA_Fetcher_2026.json"),
    path.resolve(process.cwd(), "public", "data", "COA_Fetcher_2026.json"),
  ]);
}

export function resolveJobsSourcePath() {
  const jsonPath = newestExistingPath(jsonCandidates());
  if (jsonPath) return { path: jsonPath, type: "json" as const };

  const csvPath = newestExistingPath(csvCandidates());
  if (csvPath) return { path: csvPath, type: "csv" as const };

  throw new Error(`Required jobs data not found. Checked: ${jsonCandidates().concat(csvCandidates()).join(" | ")}`);
}

export function resolveCsvPath() {
  const csvPath = newestExistingPath(csvCandidates());
  if (!csvPath) {
    throw new Error(`Required CSV not found. Checked: ${csvCandidates().join(" | ")}`);
  }
  return csvPath;
}

function parseJobDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const yearValue = Number(slashMatch[3]);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateForRecord(date: Date | null, fallback: string) {
  if (!date) return fallback;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateKey(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function zipToBorough(zip: string) {
  if (/^10[012]\d{2}$/.test(zip)) return "Manhattan";
  if (/^103\d{2}$/.test(zip)) return "Staten Island";
  if (/^104\d{2}$/.test(zip)) return "Bronx";
  if (/^112\d{2}$/.test(zip)) return "Brooklyn";
  if (/^(1100[45]|111\d{2}|113\d{2}|114\d{2}|116\d{2})$/.test(zip)) return "Queens";
  return "";
}

function inferBorough(row: SourceRow, address: string) {
  const listed = pick(row, ["Borough", "Boro", "borough", "County", "county"]);
  if (listed) return listed;

  const source = [
    address,
    pick(row, ["BuildingAddress", "Address", "Location", "location", "Property Address"]),
  ].join(" ");
  const zipMatch = source.match(/\b(10[0-4]\d{2}|11[0-6]\d{2})\b/);
  return zipMatch ? zipToBorough(zipMatch[1]) : "";
}

function normalizeSourceStatus(status: string, hasAwardDate: boolean) {
  const text = String(status || "").trim();
  if (!text) return hasAwardDate ? "Awarded" : "Open";

  const normalized = text.toLowerCase().replace(/[\s-]+/g, "_");
  const pipelineStatuses = new Set([
    "matched",
    "ok",
    "recovered_itb",
    "cleaned_itb_description",
    "pdf_page_3",
    "contact_found",
    "request_hpd_contact",
  ]);

  return pipelineStatuses.has(normalized) ? (hasAwardDate ? "Awarded" : "Open") : text;
}

function normalizeJob(row: SourceRow, index: number): JobRecord {
  const id = pick(row, ["OMO", "Job ID", "job_id", "id", "omo", "EQ No", "eq_no"]) || `JOB-${index + 1}`;
  const address = pick(row, [
    "BuildingAddress",
    "buildingAddress",
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
  const borough = inferBorough(row, address);
  const trade = pick(row, ["Trade", "Trade_Summary", "trade", "trade_summary"]);
  const awardDate = pick(row, ["AwardDate", "awardDate", "Award_Date", "AwardDate_dt"]);
  const parsedAwardDate = parseJobDate(awardDate);
  const workStartDate = pick(row, [
    "WorkStartDate",
    "startDate",
    "StartDate",
    "ActualWorkStartDate",
    "Work_Start_Date",
    "start_date",
  ]);
  const workCompletionDate = pick(row, [
    "WorkCompletionDate",
    "completionDate",
    "CompletionDate",
    "ActualWorkCompletionDate",
    "Work_Completion_Date",
    "completion_date",
  ]);
  const status = normalizeSourceStatus(
    pick(row, ["Status", "status", "job_status", "Job Status", "state"]),
    Boolean(parsedAwardDate),
  );
  const bidAmount = pick(row, ["BidAmount", "bidAmount", "AwardAmount", "Award_Amount", "bid_amount", "amountValue"]);
  const description = pick(row, [
    "JobDescription",
    "description",
    "DescriptionOfWork",
    "FullDescription",
    "Description",
    "Summary",
    "JobDescription",
  ]);
  const tenantName = cleanSourceValue(pick(row, ["TenantName", "tenantName", "Tenant", "tenant_name"]));
  const tenantPhone = cleanSourceValue(pick(row, ["TenantPhone", "tenantPhone", "Phone", "phone"]));
  const location = pick(row, ["Location", "location"]);
  const latitude = pick(row, ["Latitude", "latitude"]);
  const longitude = pick(row, ["Longitude", "longitude"]);
  const coaFile = pick(row, ["COAFile", "coaFile", "COA_File", "coa_file"]);
  const itbFile = pick(row, ["ITBFile", "itbFile", "ITB_File", "itb_file"]);

  return {
    id,
    borough,
    status,
    archived: false,
    statusOverride: "",
    workflowStatus: "",
    updatedAt: "",
    address,
    trade,
    awardDate: formatDateForRecord(parsedAwardDate, awardDate),
    startDate: formatDateForRecord(parseJobDate(workStartDate), workStartDate),
    completionDate: formatDateForRecord(parseJobDate(workCompletionDate), workCompletionDate),
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
    raw: row as Record<string, string>,
  };
}

function isFrom2026Onward(job: JobRecord) {
  const dates = [job.awardDate, job.startDate, job.completionDate]
    .map((value) => parseJobDate(value))
    .filter((date): date is Date => Boolean(date));

  return dates.some((date) => date.getFullYear() >= 2026);
}

export function parseJobsFromCsv(csvText: string, overrides = readOverrides()): JobRecord[] {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return normalizeJobs((parsed.data ?? []) as SourceRow[], overrides);
}

export function parseJobsFromJson(jsonText: string, overrides = readOverrides()): JobRecord[] {
  const parsed = JSON.parse(jsonText) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { jobs?: unknown[] }).jobs)
      ? (parsed as { jobs: unknown[] }).jobs
      : [];

  return normalizeJobs(rows.filter((row): row is SourceRow => Boolean(row) && typeof row === "object"), overrides);
}

function normalizeJobs(rows: SourceRow[], overrides = readOverrides()): JobRecord[] {
  return rows
    .map((row: SourceRow, index: number) => {
      const job = normalizeJob(row, index);
      const override = getOverrideForJob(job.id, overrides);
      const status = effectiveStatus(job.status, override);

      return {
        ...job,
        status,
        archived: isArchived(override),
        statusOverride: override?.StatusOverride || "",
        workflowStatus: override?.WorkflowStatus || "",
        updatedAt: override?.UpdatedAt || "",
      };
    })
    .filter(isFrom2026Onward);
}

export function getJobsSourceInfo() {
  const source = resolveJobsSourcePath();
  const stat = fs.statSync(source.path);

  return {
    path: source.path,
    type: source.type,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export function getJobsCoverageInfo(jobs: JobRecord[] = getJobs()) {
  const today = startOfDay(new Date());
  const awardDates: Date[] = [];
  const allDates: Date[] = [];
  let jobsAfterToday = 0;

  for (const job of jobs) {
    const jobDates = [job.awardDate, job.startDate, job.completionDate]
      .map((value) => parseJobDate(value))
      .filter((date): date is Date => Boolean(date));

    if (jobDates.some((date) => startOfDay(date) > today)) {
      jobsAfterToday += 1;
    }

    const awardDate = parseJobDate(job.awardDate);
    if (awardDate) awardDates.push(awardDate);
    allDates.push(...jobDates);
  }

  const newestAwardDate = awardDates.length ? new Date(Math.max(...awardDates.map((date) => date.getTime()))) : null;
  const newestJobDate = allDates.length ? new Date(Math.max(...allDates.map((date) => date.getTime()))) : null;
  const oldestJobDate = allDates.length ? new Date(Math.min(...allDates.map((date) => date.getTime()))) : null;
  const dataThroughDate = newestAwardDate || newestJobDate;
  const daysBehind = dataThroughDate
    ? Math.max(0, Math.round((today.getTime() - startOfDay(dataThroughDate).getTime()) / 86400000))
    : null;

  return {
    today: formatDateKey(today),
    oldestJobDate: formatDateKey(oldestJobDate),
    newestAwardDate: formatDateKey(newestAwardDate),
    newestJobDate: formatDateKey(newestJobDate),
    dataThroughDate: formatDateKey(dataThroughDate),
    daysBehind,
    jobsAfterToday,
  };
}

export function getJobs(): JobRecord[] {
  const source = resolveJobsSourcePath();
  const text = fs.readFileSync(source.path, "utf-8");

  return source.type === "json" ? parseJobsFromJson(text) : parseJobsFromCsv(text);
}

export function getJobById(id: string) {
  return getJobs().find((job) => job.id.toLowerCase() === id.toLowerCase()) ?? null;
}
