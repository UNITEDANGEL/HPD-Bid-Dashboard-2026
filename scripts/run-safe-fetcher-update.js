const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const STATUS_PATH = path.join(DATA_DIR, "fetcher_latest_status.json");
const LOG_PATH = path.join(DATA_DIR, "fetcher_latest_run.log");

function now() {
  return new Date().toISOString();
}

function writeStatus(status) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf8");
}

function appendLog(text) {
  fs.appendFileSync(LOG_PATH, text + "\n", "utf8");
}

function runStep(name, command, args) {
  appendLog(`\n========== ${name} ==========`);
  appendLog(`$ ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell: process.platform === "win32",
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    },
  });

  if (result.stdout) appendLog(result.stdout);
  if (result.stderr) appendLog(result.stderr);

  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status}`);
  }

  return result.stdout || "";
}

function extractNumber(text, label) {
  const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*(\\d+)", "i");
  const m = String(text || "").match(re);
  return m ? Number(m[1]) : null;
}

function summarizeChecks(mappingOut, descOut, itbOut) {
  return {
    rawRows: extractNumber(mappingOut, "Raw JSON rows"),
    rows2026: extractNumber(mappingOut, "2026 rows"),
    mapped2026: extractNumber(mappingOut, "2026 rows with valid NYC coordinates"),
    notMapped2026: extractNumber(mappingOut, "2026 rows NOT valid mapped"),
    badDescriptions: extractNumber(descOut, "Bad/boilerplate descriptions"),
    missingDescriptions: extractNumber(descOut, "Missing descriptions"),
    missingItbJobs: extractNumber(itbOut, "Missing ITB jobs"),
  };
}

async function main() {
  const startedAt = now();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, `Fetcher run started: ${startedAt}\n`, "utf8");

  const status = {
    state: "running",
    startedAt,
    finishedAt: null,
    ok: false,
    error: "",
    summary: {},
    logPath: "data/fetcher_latest_run.log",
  };

  writeStatus(status);

  try {
    if (!fs.existsSync(path.join(ROOT, "FetchrMatcherV5.py"))) {
      throw new Error("FetchrMatcherV5.py not found in project root.");
    }

    if (!fs.existsSync(path.join(ROOT, "credentials.json"))) {
      throw new Error("credentials.json missing. Gmail fetcher cannot run on this machine.");
    }

    // token.json may be created by OAuth on first local run.
    appendLog("Credentials file exists. Starting 7-day fetcher pipeline.");

    runStep("Run Gmail fetcher for last 7 days", "python", ["FetchrMatcherV5.py", "--update", "--days", "7"]);

    runStep("Safe merge fetcher output into dashboard data", "node", ["safe-merge-7day-fetch.js"]);

    runStep("Geocode new safe-merged jobs", "node", ["geocode-new-safe-fetch-jobs.js"]);

    // This script is harmless if the known rows are already patched.
    if (fs.existsSync(path.join(ROOT, "manual-geocode-11-new-jobs.js"))) {
      runStep("Apply manual fallback geocodes", "node", ["manual-geocode-11-new-jobs.js"]);
    }

    // This script is harmless if those rows are already patched.
    if (fs.existsSync(path.join(ROOT, "patch-9-recovered-drive-itbs.js"))) {
      runStep("Apply known recovered Drive ITB matches", "node", ["patch-9-recovered-drive-itbs.js"]);
    }

    runStep("Recover descriptions from matched ITBs", "python", ["recover-new-itb-descriptions.py"]);

    const mappingOut = runStep("Verify mapping", "node", ["check-local-mapping.js"]);
    const descOut = runStep("Verify descriptions", "node", ["check-generic-descriptions.js"]);
    const itbOut = runStep("Verify missing ITB", "node", ["export-missing-itb.js"]);

    const summary = summarizeChecks(mappingOut, descOut, itbOut);

    status.state = "complete";
    status.ok = true;
    status.finishedAt = now();
    status.summary = summary;

    appendLog(`\nFetcher run finished: ${status.finishedAt}`);
    appendLog(JSON.stringify(summary, null, 2));
    writeStatus(status);

    console.log(JSON.stringify(status, null, 2));
  } catch (err) {
    status.state = "failed";
    status.ok = false;
    status.finishedAt = now();
    status.error = err.message || String(err);

    appendLog(`\nFAILED: ${status.error}`);
    writeStatus(status);

    console.error(JSON.stringify(status, null, 2));
    process.exit(1);
  }
}

main();

