import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type RawJob = Record<string, unknown>;

function text(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeJob(row: RawJob, index: number) {
  const omo = text(row.OMO) || `JOB-${index + 1}`;
  const buildingAddress = text(row.BuildingAddress);
  const location = text(row.Location);
  const description = text(row.JobDescription);

  return {
    ...row,

    id: omo,
    OMO: omo,

    address: buildingAddress,
    BuildingAddress: buildingAddress,

    location,
    Location: location,

    apartment: text(row.ApartmentUnit),
    ApartmentUnit: text(row.ApartmentUnit),

    tenantName: text(row.TenantName),
    TenantName: text(row.TenantName),

    tenantPhone: text(row.TenantPhone),
    TenantPhone: text(row.TenantPhone),

    workStartDate: text(row.WorkStartDate),
    WorkStartDate: text(row.WorkStartDate),

    workCompletionDate: text(row.WorkCompletionDate),
    WorkCompletionDate: text(row.WorkCompletionDate),

    awardDate: text(row.AwardDate),
    AwardDate: text(row.AwardDate),

    bidAmount: text(row.AwardAmount),
    AwardAmount: text(row.AwardAmount),

    awardedBy: text(row.AwardedBy),
    AwardedBy: text(row.AwardedBy),

    totalSqFt: text(row.TotalSqFt),
    TotalSqFt: text(row.TotalSqFt),

    description,
    JobDescription: description,
    Job_Description: description,

    geocode: text(row.Geocode),
    Geocode: text(row.Geocode),

    latitude: text(row.Latitude),
    Latitude: text(row.Latitude),

    longitude: text(row.Longitude),
    Longitude: text(row.Longitude),

    coaFile: text(row.COAFile),
    COAFile: text(row.COAFile),

    itbFile: text(row.ITBFile),
    ITBFile: text(row.ITBFile),

    missingITBReason: text(row.MissingITBReason),
    MissingITBReason: text(row.MissingITBReason),

    coaParseStatus: text(row.COAParseStatus),
    COAParseStatus: text(row.COAParseStatus),

    itbMatchStatus: text(row.ITBMatchStatus),
    ITBMatchStatus: text(row.ITBMatchStatus),

    status: text(row.ITBMatchStatus) || text(row.COAParseStatus) || "Loaded",

    borough: extractBorough(description),
    trade: extractTrade(description),
  };
}

function extractBorough(description: string) {
  const match = description.match(/Boro:\s*([^\n\r]+)/i);
  return match?.[1]?.trim() || "";
}

function extractTrade(description: string) {
  if (/general construction/i.test(description)) return "General Construction";
  if (/plumbing/i.test(description)) return "Plumbing";
  if (/electrical/i.test(description)) return "Electrical";
  if (/roof/i.test(description)) return "Roofing";
  if (/door/i.test(description)) return "Door / Hardware";
  if (/paint/i.test(description)) return "Painting";
  if (/lock/i.test(description)) return "Locksmith";
  return "";
}

function loadJobs() {
  const jsonPath = path.join(process.cwd(), "data", "COA_Fetcher_2026.json");

  if (!fs.existsSync(jsonPath)) {
    return {
      jobs: [],
      source: null,
      error: "Missing data/COA_Fetcher_2026.json",
    };
  }

  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);

  let rows: RawJob[] = [];

  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) rows = obj.jobs as RawJob[];
    else if (Array.isArray(obj.data)) rows = obj.data as RawJob[];
    else if (Array.isArray(obj.records)) rows = obj.records as RawJob[];
    else if (Array.isArray(obj.rows)) rows = obj.rows as RawJob[];
  }

  const jobs = rows.map((row, index) => normalizeJob(row, index));

  return {
    jobs,
    source: "COA_Fetcher_2026.json",
    count: jobs.length,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json(loadJobs());
}
