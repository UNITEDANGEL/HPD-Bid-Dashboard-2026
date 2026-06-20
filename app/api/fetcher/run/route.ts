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

  running = true;

  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["-e", "require('./scripts/run-safe-fetcher-update.js')"], {
    cwd: root,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      FETCHER_LOOKBACK_DAYS: String(daysBack),
    },
    detached: false,
    stdio: "ignore",
  });

  child.on("exit", () => {
    running = false;
  });

  child.on("error", () => {
    running = false;
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
