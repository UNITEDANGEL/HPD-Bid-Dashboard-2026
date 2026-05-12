import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const STATUS_PATH = path.join(DATA_DIR, "job_status_overrides.json");

function readStatuses(): Record<string, any> {
  try {
    if (!fs.existsSync(STATUS_PATH)) return {};
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeStatuses(statuses: Record<string, any>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(statuses, null, 2), "utf8");
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
        ...(statuses[key] || {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    }

    writeStatuses(statuses);

    return NextResponse.json({
      ok: true,
      key,
      saved: statuses[key] || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to save status." },
      { status: 500 }
    );
  }
}
