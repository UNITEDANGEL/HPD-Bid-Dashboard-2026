import { NextResponse } from "next/server";
import fs from "fs";
import { dataPath, ensureDataDir } from "../../../lib/data-paths";
import { uploadStatusOverridesToDrive, downloadStatusOverridesFromDriveIfAvailable } from "../../../lib/google-drive-status-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_JSON_PATH = dataPath("job_status_overrides.json");
const STATUS_CSV_PATH = dataPath("status_overrides_2026.csv");

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: any) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function csvEscape(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      out.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}

function readOverrideCsvRows() {
  if (!fs.existsSync(STATUS_CSV_PATH)) return [];

  const raw = fs.readFileSync(STATUS_CSV_PATH, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());

  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    header.forEach((key, index) => {
      row[key] = values[index] || "";
    });

    return row;
  });
}

function writeOverrideCsvRows(rows: Record<string, any>[]) {
  ensureDataDir();

  const header = [
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
  ];

  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n");

  fs.writeFileSync(STATUS_CSV_PATH, csv, "utf8");
}

function cleanPatch(patch: Record<string, any>) {
  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(patch || {})) {
    if (key === "__clearWorkflow") continue;
    cleaned[key] = value;
  }

  return cleaned;
}

function writeOverrideJson(key: string, patch: Record<string, any>) {
  const statuses = readJsonFile<Record<string, any>>(STATUS_JSON_PATH, {});

  if (patch.__clearWorkflow) {
    delete statuses[key];
  } else {
    statuses[key] = {
      ...cleanPatch(patch),
      updatedAt: new Date().toISOString(),
    };
  }

  writeJsonFile(STATUS_JSON_PATH, statuses);

  return statuses[key] || null;
}

function writeOverrideCsv(key: string, patch: Record<string, any>) {
  const rows = readOverrideCsvRows();
  const now = new Date().toISOString();

  const withoutExisting = rows.filter((row) => {
    const existingKey = String(row.OMO || row.RowID || "").split("|")[0]?.trim();
    return existingKey !== key;
  });

  if (patch.__clearWorkflow) {
    writeOverrideCsvRows(withoutExisting);
    return null;
  }

  const row = {
    RowID: key,
    OMO: key,
    StatusOverride: patch.StatusOverride || patch.status || "",
    WorkflowStatus: patch.WorkflowStatus || "",
    FieldOutcome: patch.FieldOutcome || "",
    RefusalDate: patch.RefusalDate || "",
    NoAccessFirstAttemptAt: patch.NoAccessFirstAttemptAt || "",
    SecondAttemptAvailableAt: patch.SecondAttemptAvailableAt || "",
    NoAccessSecondAttemptAt: patch.NoAccessSecondAttemptAt || "",
    VerifiedByOthersDate: patch.VerifiedByOthersDate || "",
    ActualWorkStartDate: patch.ActualWorkStartDate || "",
    ActualWorkCompletionDate: patch.ActualWorkCompletionDate || "",
    WorkStartDateOverride: patch.WorkStartDateOverride || "",
    WorkCompletionDateOverride: patch.WorkCompletionDateOverride || "",
    ArchivedFromMap: patch.ArchivedFromMap === true ? "true" : patch.ArchivedFromMap === false ? "false" : "",
    UpdatedAt: now,
  };

  writeOverrideCsvRows([...withoutExisting, row]);

  return row;
}

export async function GET(request: Request) {
  await downloadStatusOverridesFromDriveIfAvailable();
  const url = new URL(request.url);
  const key = String(url.searchParams.get("key") || "").trim();
  const statuses = readJsonFile<Record<string, any>>(STATUS_JSON_PATH, {});
  const csvRows = readOverrideCsvRows();

  if (key) {
    const csvRow = csvRows.find((row) => {
      const existingKey = String(row.OMO || row.RowID || "").split("|")[0]?.trim();
      return existingKey === key;
    });

    return NextResponse.json({
      ok: true,
      key,
      json: statuses[key] || null,
      csv: csvRow || null,
      files: {
        overrideCsv: STATUS_CSV_PATH,
        overrideJson: STATUS_JSON_PATH,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    statuses,
    csvRows,
    files: {
      overrideCsv: STATUS_CSV_PATH,
      overrideJson: STATUS_JSON_PATH,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const key = String(body.key || body.OMO || body.omo || "").trim();
    const patch = body.patch || {};

    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing job key." }, { status: 400 });
    }

    const saved = writeOverrideJson(key, patch);
    const savedCsv = writeOverrideCsv(key, patch);
    const driveSync = await uploadStatusOverridesToDrive();

    return NextResponse.json({
      ok: true,
      key,
      saved,
      savedCsv,
      updatedFiles: {
        overrideCsv: "status_overrides_2026.csv",
        overrideJson: "job_status_overrides.json",
      },
      note: "Status saved to override CSV/JSON only. Browser localStorage is not the source of truth.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to save status." },
      { status: 500 }
    );
  }
}


