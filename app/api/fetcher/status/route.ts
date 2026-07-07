import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readLogTail(filePath: string) {
  if (!fs.existsSync(filePath)) return "";

  try {
    const log = fs.readFileSync(filePath, "utf8");
    return log.split(/\r?\n/).slice(-100).join("\n");
  } catch {
    return "";
  }
}

function hasEnvValue(...names: string[]) {
  return names.some((name) => Boolean(process.env[name]));
}

export async function GET() {
  const root = process.cwd();
  const dataStatusPath = path.join(root, "data", "fetcher_latest_status.json");
  const publicStatusPath = path.join(root, "public", "data", "fetcher_latest_status.json");
  const dataLogPath = path.join(root, "data", "fetcher_latest_run.log");
  const publicLogPath = path.join(root, "public", "data", "fetcher_latest_run.log");

  const statusPath = fs.existsSync(dataStatusPath) ? dataStatusPath : publicStatusPath;
  const logPath = fs.existsSync(dataLogPath) ? dataLogPath : publicLogPath;

  let status: Record<string, unknown> = {
    state: "never_run",
    ok: false,
    error: "",
    summary: {},
  };

  if (fs.existsSync(statusPath)) {
    const parsed = readJson(statusPath);

    if (parsed && typeof parsed === "object") {
      status = parsed;
    } else {
      status = {
        state: "status_parse_error",
        ok: false,
        error: "Could not parse fetcher_latest_status.json",
        summary: {},
      };
    }
  }

  return NextResponse.json({
    ...status,
    logTail: readLogTail(logPath),
    logPath: path.relative(root, logPath).replace(/\\/g, "/"),
    environment: {
      hasCredentialsJson: fs.existsSync(path.join(root, "credentials.json")),
      hasTokenJson: fs.existsSync(path.join(root, "token.json")),
      hasGoogleCredentialEnv: hasEnvValue(
        "GOOGLE_CREDENTIALS_JSON_BASE64",
        "GOOGLE_CREDENTIALS_BASE64",
        "GOOGLE_CREDENTIALS_JSON",
        "GOOGLE_CREDENTIALS"
      ),
      hasGoogleTokenEnv: hasEnvValue(
        "GOOGLE_TOKEN_JSON_BASE64",
        "GOOGLE_OAUTH_TOKEN_JSON_BASE64",
        "GOOGLE_TOKEN_JSON",
        "GOOGLE_OAUTH_TOKEN_JSON"
      ),
      hasFetcherScript: fs.existsSync(path.join(root, "FetchrMatcherV5.py")),
      hasGitHubDispatchToken: Boolean(
        process.env.GITHUB_ACTIONS_PAT ||
          process.env.GITHUB_TOKEN_PAT ||
          process.env.GITHUB_PAT ||
          process.env.GITHUB_TOKEN ||
          process.env.GH_TOKEN
      ),
    },
  });
}
