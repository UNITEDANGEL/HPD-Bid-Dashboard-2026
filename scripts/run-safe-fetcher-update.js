const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const STATUS_PATH = path.join(DATA_DIR, "fetcher_latest_status.json");
const LOG_PATH = path.join(DATA_DIR, "fetcher_latest_run.log");
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const PUBLIC_STATUS_PATH = path.join(PUBLIC_DATA_DIR, "fetcher_latest_status.json");
const PUBLIC_LOG_PATH = path.join(PUBLIC_DATA_DIR, "fetcher_latest_run.log");


function restoreGoogleAuthFilesFromEnv() {
  const credentialsPath = path.join(ROOT, "credentials.json");
  const tokenPath = path.join(ROOT, "token.json");

  const base64Credentials =
    process.env.GOOGLE_CREDENTIALS_JSON_BASE64 ||
    process.env.GOOGLE_CREDENTIALS_BASE64 ||
    "";

  const rawCredentials =
    process.env.GOOGLE_CREDENTIALS_JSON ||
    process.env.GOOGLE_CREDENTIALS ||
    "";

  const base64Token =
    process.env.GOOGLE_TOKEN_JSON_BASE64 ||
    process.env.GOOGLE_OAUTH_TOKEN_JSON_BASE64 ||
    "";

  const rawToken =
    process.env.GOOGLE_TOKEN_JSON ||
    process.env.GOOGLE_OAUTH_TOKEN_JSON ||
    "";

  if (base64Credentials) {
    fs.writeFileSync(credentialsPath, Buffer.from(base64Credentials, "base64").toString("utf8"), "utf8");
    appendLog("Restored credentials.json from GOOGLE_CREDENTIALS_JSON_BASE64.");
  } else if (rawCredentials) {
    fs.writeFileSync(credentialsPath, rawCredentials, "utf8");
    appendLog("Restored credentials.json from GOOGLE_CREDENTIALS_JSON.");
  }

  if (base64Token) {
    fs.writeFileSync(tokenPath, Buffer.from(base64Token, "base64").toString("utf8"), "utf8");
    appendLog("Restored token.json from GOOGLE_TOKEN_JSON_BASE64.");
  } else if (rawToken) {
    fs.writeFileSync(tokenPath, rawToken, "utf8");
    appendLog("Restored token.json from GOOGLE_TOKEN_JSON.");
  }

  if (fs.existsSync(credentialsPath)) {
    try {
      JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
      appendLog("credentials.json validated as JSON.");
    } catch (err) {
      throw new Error("credentials.json is not valid JSON: " + (err.message || String(err)));
    }
  } else {
    appendLog("credentials.json not found.");
  }

  if (fs.existsSync(tokenPath)) {
    try {
      JSON.parse(fs.readFileSync(tokenPath, "utf8"));
      appendLog("token.json validated as JSON.");
    } catch (err) {
      throw new Error("token.json is not valid JSON: " + (err.message || String(err)));
    }
  } else {
    appendLog("token.json not found; local OAuth may create it on first authorized run.");
  }
}
function now() {
  return new Date().toISOString();
}

function writeStatus(status) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf8");
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  fs.writeFileSync(PUBLIC_STATUS_PATH, JSON.stringify(status, null, 2), "utf8");
}

function appendLog(text) {
  fs.appendFileSync(LOG_PATH, text + "\n", "utf8");
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  fs.appendFileSync(PUBLIC_LOG_PATH, text + "\n", "utf8");
}

function runStep(name, command, args) {
  appendLog(`\n========== ${name} ==========`);
  appendLog(`$ ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell: false,
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

function pythonFetcherDepsReady() {
  const result = spawnSync(
    "python",
    [
      "-c",
      "import requests, tqdm, PyPDF2, googleapiclient, google_auth_oauthlib, google.auth; print('ok')",
    ],
    {
      cwd: ROOT,
      shell: false,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
    }
  );

  return result.status === 0;
}

function extractNumber(text, label) {
  const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*(\\d+)", "i");
  const m = String(text || "").match(re);
  return m ? Number(m[1]) : null;
}

function summarizeChecks(mappingOut, descOut, itbOut, paperworkOut, fullLog) {
  return {
    fetchedCoaItems: extractNumber(fullLog, "COA items parsed (latest per OMO)"),
    fetchedItbItems: extractNumber(fullLog, "ITB items parsed (latest per OMO)"),
    fetchedFinalJobRows: extractNumber(fullLog, "Final JobRows"),
    addedNewOmos: extractNumber(fullLog, "Added new OMOs"),
    skippedExistingOmos: extractNumber(fullLog, "Skipped existing OMOs"),
    rawRows: extractNumber(mappingOut, "Raw JSON rows"),
    rows2026: extractNumber(mappingOut, "2026 rows"),
    mapped2026: extractNumber(mappingOut, "2026 rows with valid NYC coordinates"),
    notMapped2026: extractNumber(mappingOut, "2026 rows NOT valid mapped"),
    missingAddresses: extractNumber(paperworkOut, "Missing addresses"),
    badDescriptions: extractNumber(paperworkOut, "Bad/boilerplate descriptions") ?? extractNumber(descOut, "Bad/boilerplate descriptions"),
    missingDescriptions: extractNumber(paperworkOut, "Missing descriptions") ?? extractNumber(descOut, "Missing descriptions"),
    sourceReviewJobs: extractNumber(paperworkOut, "Source review jobs"),
    missingPage3Images: extractNumber(paperworkOut, "Missing page 3 images"),
    missingItbJobs: extractNumber(itbOut, "Missing ITB jobs"),
  };
}

function selectedLookbackDays() {
  const raw = Number(process.env.FETCHER_LOOKBACK_DAYS || 7);
  const safe = Number.isFinite(raw) ? Math.floor(raw) : 7;
  return Math.min(95, Math.max(1, safe));
}

function jobValue(job, ...keys) {
  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function is2026Job(job) {
  return (
    /\/26|2026/.test(jobValue(job, "AwardDate", "awardDate")) ||
    /\/26|2026/.test(jobValue(job, "WorkStartDate", "workStartDate")) ||
    /\/26|2026/.test(jobValue(job, "WorkCompletionDate", "workCompletionDate"))
  );
}

function hasValidNycCoordinates(job) {
  const lat = Number(jobValue(job, "Latitude", "latitude"));
  const lon = Number(jobValue(job, "Longitude", "longitude"));
  return Number.isFinite(lat) && Number.isFinite(lon) && lat > 40 && lat < 41 && lon > -75 && lon < -73;
}

function readLocalDataSummary() {
  const dataPath = path.join(DATA_DIR, "COA_Fetcher_2026.json");
  const qualityPath = path.join(DATA_DIR, "paperwork_data_quality.json");
  const summary = {};

  try {
    const rows = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const rows2026 = Array.isArray(rows) ? rows.filter(is2026Job) : [];
    summary.rawRows = Array.isArray(rows) ? rows.length : 0;
    summary.rows2026 = rows2026.length;
    summary.mapped2026 = rows2026.filter(hasValidNycCoordinates).length;
    summary.notMapped2026 = rows2026.filter((job) => !hasValidNycCoordinates(job)).length;
  } catch {
    // Keep the fetcher status writable even if local data is unavailable.
  }

  try {
    const quality = JSON.parse(fs.readFileSync(qualityPath, "utf8"));
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

function copyFileIfExists(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return true;
}

function syncFetchedDataToPublic() {
  const copied = [
    copyFileIfExists(path.join(DATA_DIR, "COA_Fetcher_2026.json"), path.join(PUBLIC_DATA_DIR, "COA_Fetcher_2026.json")),
    copyFileIfExists(path.join(DATA_DIR, "paperwork_data_quality.json"), path.join(PUBLIC_DATA_DIR, "paperwork_data_quality.json")),
    copyFileIfExists(path.join(DATA_DIR, "missing_itb_jobs_2026.csv"), path.join(PUBLIC_DATA_DIR, "missing_itb_jobs_2026.csv")),
  ].filter(Boolean).length;
  appendLog(`Synced ${copied} data file(s) to public/data.`);
}

function syncPublicDataBackToData() {
  const copied = [
    copyFileIfExists(path.join(PUBLIC_DATA_DIR, "COA_Fetcher_2026.json"), path.join(DATA_DIR, "COA_Fetcher_2026.json")),
    copyFileIfExists(path.join(PUBLIC_DATA_DIR, "paperwork_data_quality.json"), path.join(DATA_DIR, "paperwork_data_quality.json")),
  ].filter(Boolean).length;
  appendLog(`Synced ${copied} public data file(s) back to data.`);
}

async function main() {
  const startedAt = now();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, `Fetcher run started: ${startedAt}\n`, "utf8");
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  fs.writeFileSync(PUBLIC_LOG_PATH, `Fetcher run started: ${startedAt}\n`, "utf8");

  const status = {
    state: "running",
    startedAt,
    finishedAt: null,
    ok: false,
    error: "",
    summary: readLocalDataSummary(),
    logPath: "data/fetcher_latest_run.log",
  };

  writeStatus(status);

  try {
    restoreGoogleAuthFilesFromEnv();

    if (!fs.existsSync(path.join(ROOT, "FetchrMatcherV5.py"))) {
      throw new Error("FetchrMatcherV5.py not found in project root.");
    }

    if (!fs.existsSync(path.join(ROOT, "credentials.json"))) {
      throw new Error("credentials.json missing. Gmail fetcher cannot run on this machine.");
    }

    // token.json may be created by OAuth on first local run.
    const lookbackDays = selectedLookbackDays();
    appendLog(`Credentials file exists. Starting ${lookbackDays}-day fetcher pipeline.`);

    if (pythonFetcherDepsReady()) {
      appendLog("Python fetcher dependencies already available.");
    } else {
      runStep("Install Python fetcher dependencies", "python", ["-m", "pip", "install", "--quiet", "--no-cache-dir", "--disable-pip-version-check", "requests", "tqdm", "PyPDF2", "google-api-python-client", "google-auth-oauthlib", "google-auth-httplib2"]);
    }

    runStep(`Run Gmail fetcher for last ${lookbackDays} days`, "python", ["FetchrMatcherV5.py", "--update", "--days", String(lookbackDays)]);

    runStep("Safe merge fetcher output into dashboard data", "node", ["safe-merge-7day-fetch.js"]);

    runStep("Geocode new safe-merged jobs", "node", ["geocode-new-safe-fetch-jobs.js"]);

    // This script is harmless if the known rows are already patched.
    if (fs.existsSync(path.join(ROOT, "manual-geocode-11-new-jobs.js"))) {
      runStep("Apply manual fallback geocodes", "node", ["manual-geocode-11-new-jobs.js"]);
    }

    if (fs.existsSync(path.join(ROOT, "manual-cleanup-geocode-known-jobs.js"))) {
      runStep("Apply known cleanup geocodes", "node", ["manual-cleanup-geocode-known-jobs.js"]);
    }

    // This script is harmless if those rows are already patched.
    if (fs.existsSync(path.join(ROOT, "patch-9-recovered-drive-itbs.js"))) {
      runStep("Apply known recovered Drive ITB matches", "node", ["patch-9-recovered-drive-itbs.js"]);
    }

    runStep("Recover descriptions from matched ITBs", "python", ["recover-new-itb-descriptions.py"]);

    syncFetchedDataToPublic();

    if (fs.existsSync(path.join(ROOT, "scripts", "render-itb-page3-assets.js"))) {
      if (fs.existsSync(path.join(ROOT, "ITB_Downloads_V5"))) {
        process.env.HPD_ITB_PDF_DIR = path.join(ROOT, "ITB_Downloads_V5");
      }
      runStep("Render ITB page 3 assets", "node", ["scripts/render-itb-page3-assets.js", "--copy-pdfs"]);
    }

    if (fs.existsSync(path.join(ROOT, "scripts", "sync-itb-page3-descriptions.py"))) {
      runStep("Sync ITB page 3 descriptions", "python", ["scripts/sync-itb-page3-descriptions.py"]);
      syncPublicDataBackToData();
    }

    const mappingOut = runStep("Verify mapping", "node", ["check-local-mapping.js"]);
    const descOut = runStep("Verify descriptions", "node", ["check-generic-descriptions.js"]);
    const itbOut = runStep("Verify missing ITB", "node", ["export-missing-itb.js"]);
    const paperworkOut = runStep("Verify paperwork required data", "node", ["scripts/verify-paperwork-data.js", "--strict", "--write-report"]);

    const fullLog = fs.readFileSync(LOG_PATH, "utf8");
    const summary = summarizeChecks(mappingOut, descOut, itbOut, paperworkOut, fullLog);

    status.state = "complete";
    status.ok = true;
    status.finishedAt = now();
    status.summary = summary;

    appendLog(`\nFetcher run finished: ${status.finishedAt}`);
    appendLog(JSON.stringify(summary, null, 2));
    writeStatus(status);

    console.log(JSON.stringify(status, null, 2));
  } catch (err) {
    const message = err.message || String(err);
    status.state = message.includes("credentials.json missing") ? "blocked_auth" : "failed";
    status.ok = false;
    status.finishedAt = now();
    status.error = message;

    appendLog(`\nFAILED: ${status.error}`);
    writeStatus(status);

    console.error(JSON.stringify(status, null, 2));
    process.exit(1);
  }
}

main();





















