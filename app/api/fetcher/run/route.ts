import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let running = false;

export async function POST() {
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
    env: process.env,
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
    message: "Fetcher run started. Refresh status in a minute.",
  });
}
