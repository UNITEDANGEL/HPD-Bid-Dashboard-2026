import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROJECT_ROOT = path.resolve(process.cwd(), "..", "..");
const GENERATED_ROOT = path.join(os.homedir(), "AppData", "Local", "Temp", "HPD_Bid_Dashboard");

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function isInside(root: string, target: string) {
  const normalizedRoot = path.resolve(root).toLowerCase();
  const normalizedTarget = path.resolve(target).toLowerCase();
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = String(url.searchParams.get("path") || "").trim();

  if (!target) {
    return new NextResponse("Missing path.", { status: 400 });
  }

  const resolved = path.resolve(target);
  if (![PROJECT_ROOT, GENERATED_ROOT].some((root) => isInside(root, resolved))) {
    return new NextResponse("Forbidden path.", { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return new NextResponse("File not found.", { status: 404 });
  }

  const body = fs.readFileSync(resolved);
  const contentType = MIME_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream";

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
  });
}
