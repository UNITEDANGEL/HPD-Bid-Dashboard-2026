import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let running = false;

type RequestBody = {
  days?: unknown;
  days_back?: unknown;
  daysBack?: unknown;
};

function hasEnvValue(...names: string[]) {
  return names.some((name) => Boolean(process.env[name]));
}

function hasCredentialSource(root: string) {
  return (
    fs.existsSync(path.join(root, "credentials.json")) ||
    hasEnvValue(
      "GOOGLE_CREDENTIALS_JSON_BASE64",
      "GOOGLE_CREDENTIALS_BASE64",
      "GOOGLE_CREDENTIALS_JSON",
      "GOOGLE_CREDENTIALS"
    )
  );
}

function hasTokenSource(root: string) {
  return (
    fs.existsSync(path.join(root, "token.json")) ||
    hasEnvValue(
      "GOOGLE_TOKEN_JSON_BASE64",
      "GOOGLE_OAUTH_TOKEN_JSON_BASE64",
      "GOOGLE_TOKEN_JSON",
      "GOOGLE_OAUTH_TOKEN_JSON"
    )
  );
}

function readExistingStatus(root: string) {
  const statusPath = path.join(root, "data", "fetcher_latest_status.json");
  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function jobValue(job: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function is2026Job(job: Record<string, unknown>) {
  return (
    /\/26|2026/.test(jobValue(job, "AwardDate", "awardDate")) ||
    /\/26|2026/.test(jobValue(job, "WorkStartDate", "workStartDate")) ||
    /\/26|2026/.test(jobValue(job, "WorkCompletionDate", "workCompletionDate"))
  );
}

function hasValidNycCoordinates(job: Record<string, unknown>) {
  const lat = Number(jobValue(job, "Latitude", "latitude"));
  const lon = Number(jobValue(job, "Longitude", "longitude"));
  return Number.isFinite(lat) && Number.isFinite(lon) && lat > 40 && lat < 41 && lon > -75 && lon < -73;
}

function readLocalDataSummary(root: string) {
  const summary: Record<string, number> = {};

  try {
    const rows = JSON.parse(fs.readFileSync(path.join(root, "data", "COA_Fetcher_2026.json"), "utf8"));
    const jobs = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    const rows2026 = jobs.filter(is2026Job);
    summary.rawRows = jobs.length;
    summary.rows2026 = rows2026.length;
    summary.mapped2026 = rows2026.filter(hasValidNycCoordinates).length;
    summary.notMapped2026 = rows2026.filter((job) => !hasValidNycCoordinates(job)).length;
  } catch {
    // Keep fetcher status writable even if local data cannot be read.
  }

  try {
    const quality = JSON.parse(fs.readFileSync(path.join(root, "data", "paperwork_data_quality.json"), "utf8"));
    summary.missingAddresses = Number(quality.missingAddresses || 0);
    summary.badDescriptions = Number(quality.badDescriptions || 0);
    summary.missingDescriptions = Number(quality.missingDescriptions || 0);
    summary.sourceReviewJobs = Number(quality.sourceReviewJobs || 0);
    summary.missingPage3Images = Number(quality.missingPage3Images || 0);
    summary.missingItbJobs = Number(quality.missingItbFiles || 0);
  } catch {
    // Optional quality report.
  }

  return summary;
}

function writeFetcherStatus(root: string, status: Record<string, unknown>) {
  const statusFiles = [
    path.join(root, "data", "fetcher_latest_status.json"),
    path.join(root, "public", "data", "fetcher_latest_status.json"),
  ];

  for (const filePath of statusFiles) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(status, null, 2), "utf8");
  }
}

function blockMissingGoogleAuth(root: string) {
  const existing = readExistingStatus(root);
  const now = new Date().toISOString();
  const error =
    "Fetcher/import blocked: Google Gmail credentials are missing. Add credentials.json locally or set GOOGLE_CREDENTIALS_JSON/GOOGLE_CREDENTIALS_JSON_BASE64; add token.json or GOOGLE_TOKEN_JSON for unattended scheduled runs.";
  const status = {
    ...existing,
    state: "blocked_auth",
    ok: false,
    finishedAt: now,
    error,
    summary: {
      ...readLocalDataSummary(root),
      ...((existing.summary as Record<string, unknown> | undefined) || {}),
    },
    environment: {
      hasCredentialsJson: fs.existsSync(path.join(root, "credentials.json")),
      hasTokenJson: fs.existsSync(path.join(root, "token.json")),
      hasGoogleCredentialEnv: hasCredentialSource(root),
      hasGoogleTokenEnv: hasTokenSource(root),
    },
    logPath: "data/fetcher_latest_run.log",
  };

  writeFetcherStatus(root, status);

  return json(
    {
      ok: false,
      state: "blocked_auth",
      error,
      message: "Fetcher was not started because Google auth is not configured.",
    },
    428
  );
}

function cleanDays(value: unknown) {
  const raw = Number(value || process.env.FETCHER_DEFAULT_DAYS || 14);
  const safe = Number.isFinite(raw) ? Math.floor(raw) : 14;
  return Math.min(95, Math.max(1, safe));
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

function getGitHubToken() {
  return (
    process.env.GITHUB_ACTIONS_PAT ||
    process.env.GITHUB_TOKEN_PAT ||
    process.env.GITHUB_PAT ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ""
  );
}

function isSameSiteDashboard(request: Request) {
  const origin = request.headers.get("origin") || "";
  const host = request.headers.get("host") || "";
  const referer = request.headers.get("referer") || "";

  return !origin || origin.includes(host) || referer.includes(host);
}

function isAuthorized(request: Request) {
  const requiredSecret = process.env.FETCHER_CRON_SECRET || "";
  if (!requiredSecret) return true;

  const providedSecret = request.headers.get("x-fetcher-secret") || "";
  return providedSecret === requiredSecret || isSameSiteDashboard(request);
}

async function dispatchGitHubWorkflow(daysBack: number) {
  const token = getGitHubToken();
  if (!token) {
    return null;
  }

  const repo = process.env.GITHUB_REPOSITORY_FULL_NAME || "UNITEDANGEL/HPD-Bid-Dashboard-2026";
  const workflow = process.env.GITHUB_FETCHER_WORKFLOW || "run-fetcher.yml";
  const branch = process.env.GITHUB_FETCHER_BRANCH || "main";
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "HPD-Bid-Dashboard",
    },
    body: JSON.stringify({
      ref: branch,
      inputs: {
        days_back: String(daysBack),
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    return json(
      {
        ok: false,
        error: `GitHub workflow dispatch failed with status ${response.status}.`,
        details,
      },
      response.status
    );
  }

  return json({
    ok: true,
    state: "started",
    mode: "github-workflow",
    message: `Fetcher workflow started for ${daysBack} days.`,
    days_back: daysBack,
    branch,
    workflow,
  });
}

async function startLocalFetcher(daysBack: number) {
  if (running) {
    return json({ ok: false, error: "Fetcher is already running." }, 409);
  }

  const root = process.cwd();
  const script = path.join(root, "scripts", "run-safe-fetcher-update.js");

  if (!fs.existsSync(script)) {
    return json({ ok: false, error: "Fetcher runner script not found." }, 500);
  }

  if (!hasCredentialSource(root)) {
    return blockMissingGoogleAuth(root);
  }

  running = true;

  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      FETCHER_LOOKBACK_DAYS: String(daysBack),
    },
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });

  child.on("exit", () => {
    running = false;
  });

  child.on("error", (spawnError) => {
    running = false;
    const existing = readExistingStatus(root);
    writeFetcherStatus(root, {
      ...existing,
      state: "failed",
      ok: false,
      finishedAt: new Date().toISOString(),
      error: `Fetcher process failed to start: ${spawnError.message}`,
    });
  });

  child.unref();

  return json({
    ok: true,
    state: "started",
    mode: "local-runner",
    message: `Fetcher ${daysBack}-day run started. Refresh status in a minute.`,
    days_back: daysBack,
  });
}

export async function OPTIONS() {
  return json({ ok: true });
}

export async function GET() {
  return json({
    ok: true,
    service: "hpd-fetcher-runner",
    modes: {
      githubWorkflow: Boolean(getGitHubToken()),
      localRunner: fs.existsSync(path.join(process.cwd(), "scripts", "run-safe-fetcher-update.js")),
    },
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return json({ ok: false, error: "Unauthorized fetcher run." }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const daysBack = cleanDays(body.days ?? body.days_back ?? body.daysBack);
  const githubDispatch = await dispatchGitHubWorkflow(daysBack);

  return githubDispatch || (await startLocalFetcher(daysBack));
}
