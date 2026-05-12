import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const STATUS_PATH = path.join(DATA_DIR, "job_status_overrides.json");
const JSON_PATH = path.join(DATA_DIR, "COA_Fetcher_2026.json");
const CSV_PATH = path.join(DATA_DIR, "COA_Fetcher_2026.csv");

const WORKFLOW_FIELDS = [
  "WorkflowStatus",
  "workflowStatus",
  "FieldOutcome",
  "fieldOutcome",
  "StatusOverride",
  "status",
  "NoAccessFirstAttemptAt",
  "noAccessFirstAttemptAt",
  "NoAccessSecondAttemptAt",
  "noAccessSecondAttemptAt",
  "SecondAttemptAvailableAt",
  "secondAttemptAvailableAt",
  "RefusalDate",
  "refusalDate",
  "VerifiedByOthersDate",
  "verifiedByOthersDate",
  "ActualWorkStartDate",
  "actualWorkStartDate",
  "ActualWorkCompletionDate",
  "actualWorkCompletionDate",
  "ArchivedFromMap",
  "archivedFromMap",
  "OutcomeLockedAt",
  "outcomeLockedAt",
  "updatedAt",
];

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readStatuses(): Record<string, any> {
  return readJsonFile<Record<string, any>>(STATUS_PATH, {});
}

function writeStatuses(statuses: Record<string, any>) {
  writeJsonFile(STATUS_PATH, statuses);
}

function jobKey(job: any) {
  return String(job.OMO || job.id || job.omo || "").trim();
}

function clearWorkflowFields(job: any) {
  const next = { ...job };

  for (const field of WORKFLOW_FIELDS) {
    if (typeof next[field] === "boolean") {
      next[field] = false;
    } else {
      next[field] = "";
    }
  }

  next.status = "Pending";
  next.ITBMatchStatus = next.ITBMatchStatus || job.ITBMatchStatus || "";

  return next;
}

function updateMasterJson(key: string, patch: Record<string, any>) {
  const jobs = readJsonFile<any[]>(JSON_PATH, []);
  if (!Array.isArray(jobs)) {
    throw new Error("COA_Fetcher_2026.json is not an array.");
  }

  let updated = false;

  const nextJobs = jobs.map((job) => {
    if (jobKey(job) !== key) return job;

    updated = true;

    if (patch.__clearWorkflow) {
      return clearWorkflowFields(job);
    }

    return {
      ...clearWorkflowFields(job),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  });

  if (!updated) {
    throw new Error(`Job ${key} was not found in COA_Fetcher_2026.json.`);
  }

  writeJsonFile(JSON_PATH, nextJobs);
  writeCsvFromJson(nextJobs);

  return nextJobs.find((job) => jobKey(job) === key);
}

function parseCsvHeader(csvPath: string) {
  if (!fs.existsSync(csvPath)) return [];

  const firstLine = fs.readFileSync(csvPath, "utf8").split(/\r?\n/)[0] || "";
  return parseCsvLine(firstLine);
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

function csvEscape(value: any) {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function writeCsvFromJson(jobs: any[]) {
  const existingHeader = parseCsvHeader(CSV_PATH);
  const discovered = new Set<string>();

  for (const job of jobs) {
    Object.keys(job || {}).forEach((key) => discovered.add(key));
  }

  const header = [
    ...existingHeader.filter(Boolean),
    ...Array.from(discovered).filter((key) => !existingHeader.includes(key)),
  ];

  const csv = [
    header.map(csvEscape).join(","),
    ...jobs.map((job) => header.map((key) => csvEscape(job?.[key])).join(",")),
  ].join("\n");

  fs.writeFileSync(CSV_PATH, csv, "utf8");
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    statuses: readStatuses(),
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

    const statuses = readStatuses();

    if (patch.__clearWorkflow) {
      delete statuses[key];
    } else {
      statuses[key] = {
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    }

    writeStatuses(statuses);

    const updatedJob = updateMasterJson(key, patch);

    return NextResponse.json({
      ok: true,
      key,
      saved: statuses[key] || null,
      updatedJob,
      updatedFiles: {
        json: "data/COA_Fetcher_2026.json",
        csv: "data/COA_Fetcher_2026.csv",
        overrides: "data/job_status_overrides.json",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to save status." },
      { status: 500 }
    );
  }
}

