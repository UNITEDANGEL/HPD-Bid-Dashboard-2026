import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let running = false;

export async function POST(request: Request) {
  return NextResponse.json({
    ok: false,
    state: "disabled",
    error: "Fetcher is disabled on Render. Run it locally from C:\\dev\\Node_Dashboard_Live, then push updated data to GitHub.",
  }, { status: 410 });
  return NextResponse.json({
    ok: false,
    state: "disabled",
    error: "Fetcher is disabled on Render. Run it locally from C:\\dev\\Node_Dashboard_Live, then push updated data to GitHub.",
  }, { status: 410 });
  const requiredSecret = process.env.FETCHER_CRON_SECRET || "";
  const providedSecret = request.headers.get("x-fetcher-secret") || "";

  const origin = request.headers.get("origin") || "";
  const host = request.headers.get("host") || "";
  const referer = request.headers.get("referer") || "";

  const sameSiteDashboard =
    !origin ||
    origin.includes(host) ||
    referer.includes(host) ||
    origin.includes("hpd-bid-dashboard-2026.onrender.com") ||
    referer.includes("hpd-bid-dashboard-2026.onrender.com");

  if (requiredSecret && providedSecret !== requiredSecret && !sameSiteDashboard) {
    return NextResponse.json({ ok: false, error: "Unauthorized fetcher run." }, { status: 401 });
  }
    const defaultDays = Math.min(95, Math.max(1, Number(process.env.FETCHER_DEFAULT_DAYS || 7) || 7));
  let requestedDays = defaultDays;
  try {
    const body = await request.json().catch(() => ({}));
    const parsedDays = Number(body?.days);
    if (Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= 95) {
      requestedDays = Math.floor(parsedDays);
    }
  } catch {
    requestedDays = defaultDays;
  }
  if (running) {
    return NextResponse.json({ ok: false, error: "Fetcher is already running." }, { status: 409 });
  }

  const root = process.cwd();
  const script = path.join(root, "scripts", "run-safe-fetcher-update.js");

  if (!fs.existsSync(script)) {
    return NextResponse.json({ ok: false, error: "Fetcher runner script not found." }, { status: 500 });
  }

  running = true;

  const child = spawn("node", [script], {
    cwd: root,
    shell: process.platform === "win32",
    env: { ...process.env, FETCHER_LOOKBACK_DAYS: String(requestedDays) },
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

  return NextResponse.json({
    ok: true,
    state: "started",
    message: `Fetcher ${requestedDays}-day run started. Refresh status in a minute.`,
  });
}








