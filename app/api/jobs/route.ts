import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type RawJob = Record<string, unknown>;

function text(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }

  out.push(cur);
  return out;
}

function normalizeJob(row: RawJob, index: number) {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  };

  const omo = get("OMO", "omo", "Job_ID", "Job ID", "jobId", "id") || `JOB-${index + 1}`;
  const buildingAddress = get("BuildingAddress", "Building_Address", "Building Address", "Address", "address");
  const location = get("Location", "location");
  const description = get("JobDescription", "Job_Description", "Job Description", "Description", "description");

  return {
    ...row,

    id: omo,
    OMO: omo,

    address: buildingAddress,
    BuildingAddress: buildingAddress,

    location,
    Location: location,

    apartment: get("ApartmentUnit", "Apartment", "Apt", "APT", "Unit"),
    ApartmentUnit: get("ApartmentUnit", "Apartment", "Apt", "APT", "Unit"),

    tenantName: get("TenantName", "Tenant Name"),
    TenantName: get("TenantName", "Tenant Name"),

    tenantPhone: get("TenantPhone", "Tenant Phone", "Phone", "phone"),
    TenantPhone: get("TenantPhone", "Tenant Phone", "Phone", "phone"),

    workStartDate: get("WorkStartDate", "Work Start Date"),
    WorkStartDate: get("WorkStartDate", "Work Start Date"),

    workCompletionDate: get("WorkCompletionDate", "Work Completion Date"),
    WorkCompletionDate: get("WorkCompletionDate", "Work Completion Date"),

    awardDate: get("AwardDate", "Award Date", "Award_Date"),
    AwardDate: get("AwardDate", "Award Date", "Award_Date"),

    bidAmount: get("AwardAmount", "Award Amount", "Award_Amount", "Bid Amount", "Amount"),
    AwardAmount: get("AwardAmount", "Award Amount", "Award_Amount", "Bid Amount", "Amount"),

    awardedBy: get("AwardedBy", "Awarded By"),
    AwardedBy: get("AwardedBy", "Awarded By"),

    totalSqFt: get("TotalSqFt", "Total Sq Ft"),
    TotalSqFt: get("TotalSqFt", "Total Sq Ft"),

    description,
    JobDescription: description,
    Job_Description: description,

    geocode: get("Geocode"),
    Geocode: get("Geocode"),

    latitude: get("Latitude", "latitude", "lat"),
    Latitude: get("Latitude", "latitude", "lat"),

    longitude: get("Longitude", "longitude", "lng", "lon"),
    Longitude: get("Longitude", "longitude", "lng", "lon"),

    coaFile: get("COAFile", "COA File", "COA_File", "coaFile"),
    COAFile: get("COAFile", "COA File", "COA_File", "coaFile"),

    itbFile: get("ITBFile", "ITB File", "ITB_File", "itbFile"),
    ITBFile: get("ITBFile", "ITB File", "ITB_File", "itbFile"),

    missingITBReason: get("MissingITBReason", "Missing ITB Reason"),
    MissingITBReason: get("MissingITBReason", "Missing ITB Reason"),

    coaParseStatus: get("COAParseStatus", "COA Parse Status"),
    COAParseStatus: get("COAParseStatus", "COA Parse Status"),

    itbMatchStatus: get("ITBMatchStatus", "ITB Match Status"),
    ITBMatchStatus: get("ITBMatchStatus", "ITB Match Status"),

    status: get("ITBMatchStatus", "ITB Match Status") || get("COAParseStatus", "COA Parse Status") || "Loaded",

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

function loadCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: RawJob = {};

    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });

    return normalizeJob(row, index);
  });
}

function loadJson(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);

  let rows: RawJob[] = [];

  if (Array.isArray(parsed)) {
    rows = parsed as RawJob[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) rows = obj.jobs as RawJob[];
    else if (Array.isArray(obj.data)) rows = obj.data as RawJob[];
    else if (Array.isArray(obj.records)) rows = obj.records as RawJob[];
    else if (Array.isArray(obj.rows)) rows = obj.rows as RawJob[];
  }

  return rows.map((row, index) => normalizeJob(row, index));
}

export async function GET() {
  const csvPath = path.join(process.cwd(), "data", "COA_Fetcher_2026.csv");
  const jsonPath = path.join(process.cwd(), "data", "COA_Fetcher_2026.json");

  if (fs.existsSync(csvPath)) {
    const jobs = loadCsv(csvPath);

    return NextResponse.json({
      jobs,
      source: "COA_Fetcher_2026.csv",
      count: jobs.length,
      updatedAt: new Date().toISOString(),
    });
  }

  if (fs.existsSync(jsonPath)) {
    const jobs = loadJson(jsonPath);

    return NextResponse.json({
      jobs,
      source: "COA_Fetcher_2026.json",
      count: jobs.length,
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    jobs: [],
    source: null,
    count: 0,
    error: "No job source found. Expected data/COA_Fetcher_2026.csv",
  });
}
