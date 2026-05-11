import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const root = process.cwd();
  const statusPath = path.join(root, "data", "fetcher_latest_status.json");
  const logPath = path.join(root, "data", "fetcher_latest_run.log");

  let status: any = {
    state: "never_run",
    ok: false,
    error: "",
    summary: {},
  };

  if (fs.existsSync(statusPath)) {
    try {
      status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    } catch {
      status = {
        state: "status_parse_error",
        ok: false,
        error: "Could not parse fetcher_latest_status.json",
        summary: {},
      };
    }
  }

  let logTail = "";
  if (fs.existsSync(logPath)) {
    const log = fs.readFileSync(logPath, "utf8");
    logTail = log.split(/\r?\n/).slice(-80).join("\n");
  }

  return NextResponse.json({
    ...status,
    logTail,
    environment: {
      hasCredentialsJson: fs.existsSync(path.join(root, "credentials.json")),
      hasTokenJson: fs.existsSync(path.join(root, "token.json")),
      hasFetcherScript: fs.existsSync(path.join(root, "FetchrMatcherV5.py")),
    },
  });
}
