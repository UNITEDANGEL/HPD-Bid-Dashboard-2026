import { NextResponse } from "next/server";
import {
  downloadStatusOverridesFromDriveIfAvailable,
  uploadStatusOverridesToDrive,
} from "../../../lib/google-drive-status-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const download = await downloadStatusOverridesFromDriveIfAvailable();

  return NextResponse.json({
    ok: download.ok,
    action: "download",
    download,
  });
}

export async function POST() {
  const upload = await uploadStatusOverridesToDrive();

  return NextResponse.json({
    ok: upload.ok,
    action: "upload",
    upload,
  });
}
