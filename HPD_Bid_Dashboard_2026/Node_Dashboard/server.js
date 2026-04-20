const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { URL } = require("url");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const MERGED_CSV = path.join(PROJECT_ROOT, "Samples", "Merged Data", "merged_job_data.csv");
const FETCHER_SCRIPT = path.join(PROJECT_ROOT, "NEW SCRIPTS", "FetchAndMatch_Final.py");
const GENERATE_SCRIPT = path.join(__dirname, "generate_documents_bridge.py");
const PYTHON_EXE = "C:\\Users\\19174\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";

const DOCUMENT_DIRS = [
  path.join(PROJECT_ROOT, "Confirmations_of_Award"),
  path.join(PROJECT_ROOT, "Invitations_to_Bid"),
  path.join(PROJECT_ROOT, "Downloads"),
  path.join(PROJECT_ROOT, "Downloads", "ITB"),
  path.join(PROJECT_ROOT, "HPD_Bid_Dashboard_2026", "COA_PDFs"),
  path.join(PROJECT_ROOT, "HPD_Bid_Dashboard_2026", "ITB_PDFs"),
];

const RUNTIME_ROOT = path.join(os.tmpdir(), "HPD_Bid_Node_Dashboard");
const RECORDS_DIR = path.join(RUNTIME_ROOT, "records");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
};

fs.mkdirSync(RECORDS_DIR, { recursive: true });

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const body = await fsp.readFile(filePath);
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  res.end(body);
}

function parseCsv(text) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (currentRow.some((field) => field.length > 0)) {
    rows.push(currentRow);
  }

  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index] || "";
    });
    return object;
  });
}

function readJsonIfExists(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function recordPathForOmo(omo) {
  return path.join(RECORDS_DIR, `${safeString(omo) || "UNKNOWN"}.json`);
}

async function loadRecordState(omo) {
  return readJsonIfExists(recordPathForOmo(omo), {});
}

async function saveRecordState(omo, payload) {
  const current = await loadRecordState(omo);
  const merged = { ...current, ...payload, updatedAt: new Date().toISOString() };
  await fsp.writeFile(recordPathForOmo(omo), JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

function buildDocumentIndex() {
  const index = new Map();

  function walk(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        const key = entry.name.toLowerCase();
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(fullPath);
      }
    }
  }

  DOCUMENT_DIRS.forEach(walk);
  return index;
}

const documentIndex = buildDocumentIndex();

function buildCandidateNames(filename, kind) {
  const clean = safeString(filename);
  if (!clean) return [];
  const names = [clean];
  if (kind === "itb" && clean.toUpperCase().endsWith("_ITB.PDF")) {
    names.push(`${clean.slice(0, -8)}.pdf`);
  }
  if (kind === "itb" && clean.toLowerCase().endsWith(".pdf") && !clean.toUpperCase().endsWith("_ITB.PDF")) {
    names.push(`${clean.slice(0, -4)}_ITB.pdf`);
  }
  return Array.from(new Set(names));
}

function resolveDocument(filename, kind) {
  const preferredRoot = kind === "coa"
    ? path.join(PROJECT_ROOT, "Confirmations_of_Award")
    : path.join(PROJECT_ROOT, "Invitations_to_Bid");

  for (const candidate of buildCandidateNames(filename, kind)) {
    const matches = documentIndex.get(candidate.toLowerCase()) || [];
    if (!matches.length) continue;
    const preferred = matches.find((match) => match.startsWith(preferredRoot));
    return preferred || matches[0];
  }
  return "";
}

function normalizeDisplayRow(rawRow, recordState) {
  const fields = recordState.fields || {};
  const generatedDocuments = recordState.generatedDocuments || {};
  const address = safeString(rawRow.BuildingAddress || rawRow.Address || rawRow.Location);
  const trade = safeString(rawRow.Trade || rawRow.Trade_Summary);
  const description = safeString(
    fields.jobDescriptionOverride ||
    rawRow.JobDescription ||
    rawRow.DescriptionOfWork ||
    rawRow.FullDescription ||
    rawRow.Description ||
    rawRow.Summary
  );

  return {
    ...rawRow,
    rowId: [
      safeString(rawRow.OMO),
      address,
      safeString(rawRow.COA_File),
      safeString(rawRow.ITB_File),
    ].join("|"),
    OMO: safeString(rawRow.OMO),
    BuildingAddress: address,
    displayStatus: safeString(fields.statusOverride || rawRow.Status || "Pending"),
    displayTrade: safeString(fields.tradeOverride || trade),
    displayTenantName: safeString(fields.tenantNameOverride || rawRow.TenantName || rawRow.Tenant),
    displayTenantPhone: safeString(fields.tenantPhoneOverride || rawRow.TenantPhone || rawRow.Phone),
    displayLocation: safeString(fields.locationOverride || rawRow.Location),
    displayDescription: description,
    displayNotes: safeString(fields.notes || rawRow.Notes),
    coaPath: resolveDocument(rawRow.COA_File, "coa"),
    itbPath: resolveDocument(rawRow.ITB_File, "itb"),
    generatedDocuments,
    fields,
  };
}

async function loadWorkOrders() {
  const csvText = await fsp.readFile(MERGED_CSV, "utf-8");
  const rows = parseCsv(csvText);
  const result = [];
  for (const row of rows) {
    const recordState = await loadRecordState(row.OMO);
    result.push(normalizeDisplayRow(row, recordState));
  }
  return result;
}

function isAllowedFile(filePath) {
  const resolved = path.resolve(filePath);
  return [PROJECT_ROOT, RUNTIME_ROOT].some((root) => resolved.startsWith(path.resolve(root)));
}

async function handleFileRequest(reqUrl, res) {
  const target = reqUrl.searchParams.get("path");
  if (!target) {
    sendText(res, 400, "Missing path.");
    return;
  }
  const resolved = path.resolve(target);
  if (!isAllowedFile(resolved)) {
    sendText(res, 403, "Forbidden path.");
    return;
  }
  if (!fs.existsSync(resolved)) {
    sendText(res, 404, "File not found.");
    return;
  }
  await serveStaticFile(res, resolved);
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleRunFetcher(res) {
  if (!fs.existsSync(FETCHER_SCRIPT)) {
    sendJson(res, 404, { ok: false, error: "Fetcher script not found." });
    return;
  }

  const child = spawn(PYTHON_EXE, [FETCHER_SCRIPT], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    sendJson(res, 200, {
      ok: code === 0,
      code,
      stdout: stdout.slice(-12000),
      stderr: stderr.slice(-12000),
    });
  });
}

async function handleGenerateDocuments(rawBody, res) {
  if (!fs.existsSync(GENERATE_SCRIPT)) {
    sendJson(res, 404, { ok: false, error: "Generate script not found." });
    return;
  }

  const payload = rawBody ? JSON.parse(rawBody) : {};
  const omo = safeString(payload.omo);
  const action = safeString(payload.action);
  const affidavitType = safeString(payload.affidavitType) || "Work Completed";

  if (!omo || !action) {
    sendJson(res, 400, { ok: false, error: "Missing omo or action." });
    return;
  }

  const args = [
    GENERATE_SCRIPT,
    "--omo",
    omo,
    "--action",
    action,
    "--affidavit-type",
    affidavitType,
  ];

  const child = spawn(PYTHON_EXE, args, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    if (code !== 0) {
      sendJson(res, 500, {
        ok: false,
        code,
        error: stderr || stdout || "Document generation failed.",
      });
      return;
    }

    try {
      const parsed = JSON.parse(stdout.trim());
      sendJson(res, 200, parsed);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "Failed to parse generation response.",
        stdout,
        stderr,
      });
    }
  });
}

async function handleApiRequest(req, reqUrl, res) {
  if (req.method === "GET" && reqUrl.pathname === "/api/work-orders") {
    const workOrders = await loadWorkOrders();
    sendJson(res, 200, { ok: true, workOrders, runtimeRoot: RUNTIME_ROOT });
    return;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/run-fetcher") {
    await handleRunFetcher(res);
    return;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/generate-documents") {
    const rawBody = await collectRequestBody(req);
    await handleGenerateDocuments(rawBody, res);
    return;
  }

  if (reqUrl.pathname.startsWith("/api/records/")) {
    const omo = decodeURIComponent(reqUrl.pathname.replace("/api/records/", ""));
    if (req.method === "GET") {
      const state = await loadRecordState(omo);
      sendJson(res, 200, { ok: true, state });
      return;
    }
    if (req.method === "POST") {
      const rawBody = await collectRequestBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const state = await saveRecordState(omo, payload);
      sendJson(res, 200, { ok: true, state });
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: "API route not found." });
}

async function requestHandler(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (reqUrl.pathname.startsWith("/api/")) {
      await handleApiRequest(req, reqUrl, res);
      return;
    }

    if (reqUrl.pathname === "/file") {
      await handleFileRequest(reqUrl, res);
      return;
    }

    let filePath = path.join(PUBLIC_DIR, reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname);
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendText(res, 403, "Forbidden.");
      return;
    }
    if (!fs.existsSync(filePath)) {
      sendText(res, 404, "Not found.");
      return;
    }
    await serveStaticFile(res, filePath);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Server error." });
  }
}

const PORT = Number(process.env.PORT || 8789);
http.createServer(requestHandler).listen(PORT, () => {
  console.log(`HPD Node dashboard running at http://localhost:${PORT}`);
  console.log(`Runtime data: ${RUNTIME_ROOT}`);
});
