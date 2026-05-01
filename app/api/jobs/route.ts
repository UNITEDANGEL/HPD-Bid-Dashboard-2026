import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

export const dynamic = "force-dynamic";

type RawJob = Record<string, unknown>;

function text(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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
  if (/window/i.test(description)) return "Window";
  if (/cabinet/i.test(description)) return "Cabinet";
  return "";
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
  const latitude = get("Latitude", "latitude", "lat");
  const longitude = get("Longitude", "longitude", "lng", "lon");

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

    latitude,
    Latitude: latitude,

    longitude,
    Longitude: longitude,

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

    status: get("StatusOverride", "Status Override") || get("ITBMatchStatus", "ITB Match Status") || get("COAParseStatus", "COA Parse Status") || "Loaded",
    StatusOverride: get("StatusOverride", "Status Override"),

    borough: extractBorough(description),
    trade: extractTrade(description),
  };
}

function parseStatusOverrides() {
  const overridePath = path.join(process.cwd(), "data", "status_overrides_2026.csv");

  const map = new Map<string, Record<string, string>>();

  if (!fs.existsSync(overridePath)) return map;

  const raw = fs.readFileSync(overridePath, "utf8").replace(/^\uFEFF/, "");

  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  parsed.data.forEach((row) => {
    const rowId = text(row.RowID);
    const omo = rowId.split("|")[0]?.trim();

    if (!omo) return;

    map.set(omo, {
      StatusOverride: text(row.StatusOverride),
      WorkStartDateOverride: text(row.WorkStartDateOverride),
      WorkCompletionDateOverride: text(row.WorkCompletionDateOverride),
    });
  });

  return map;
}

function loadCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

  const parsed = Papa.parse<RawJob>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const overrides = parseStatusOverrides();

  if (parsed.errors.length) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 5));
  }

  return parsed.data
    .filter((row) => text(row.OMO) || text(row.BuildingAddress) || text(row.JobDescription))
    .filter((row) =>
      /\/26|2026/.test(text(row.AwardDate)) ||
      /\/26|2026/.test(text(row.WorkStartDate)) ||
      /\/26|2026/.test(text(row.WorkCompletionDate))
    )
    .map((row, index) => {
      const omo = text(row.OMO);
      const override = overrides.get(omo);

      if (override) {
        if (override.StatusOverride) {
          row.StatusOverride = override.StatusOverride;
          row.status = override.StatusOverride;
          row.ITBMatchStatus = override.StatusOverride;
        }

        if (override.WorkStartDateOverride) {
          row.WorkStartDateOverride = override.WorkStartDateOverride;
          row.WorkStartDate = override.WorkStartDateOverride;
        }

        if (override.WorkCompletionDateOverride) {
          row.WorkCompletionDateOverride = override.WorkCompletionDateOverride;
          row.WorkCompletionDate = override.WorkCompletionDateOverride;
        }
      }

      return normalizeJob(row, index);
    });
}

export async function GET() {
  const csvPath = path.join(process.cwd(), "data", "COA_Fetcher_2026.csv");

  if (!fs.existsSync(csvPath)) {
    return NextResponse.json({
      jobs: [],
      source: null,
      count: 0,
      error: "No job source found. Expected data/COA_Fetcher_2026.csv",
    });
  }

  const jobs = loadCsv(csvPath);

  return NextResponse.json({
    jobs,
    source: "COA_Fetcher_2026.csv",
    count: jobs.length,
    updatedAt: new Date().toISOString(),
  });
}


