const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const csvPath = "./data/COA_Fetcher_2026.csv";
const matchesPath = "./data/missing_itb_best_matches.csv";

const backupJson = "./data/COA_Fetcher_2026.before_itb_recovery.json";
const backupCsv = "./data/COA_Fetcher_2026.before_itb_recovery.csv";

fs.copyFileSync(jsonPath, backupJson);
fs.copyFileSync(csvPath, backupCsv);

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const matchLines = fs.readFileSync(matchesPath, "utf8").split(/\r?\n/).filter(Boolean);
const matchHeaders = parseCsvLine(matchLines[0]);
const omoIdx = matchHeaders.indexOf("OMO");
const itbFileIdx = matchHeaders.indexOf("RecoveredITBFile");

const recovered = new Map();

for (const line of matchLines.slice(1)) {
  const cols = parseCsvLine(line);
  const omo = cols[omoIdx];
  const itbFile = cols[itbFileIdx];

  if (omo && itbFile) recovered.set(omo, itbFile);
}

console.log("Recovered ITB matches loaded:", recovered.size);

const rawJson = fs.readFileSync(jsonPath, "utf8");
const data = JSON.parse(rawJson);
const jobs = Array.isArray(data) ? data : (data.jobs || []);

let jsonPatched = 0;

for (const job of jobs) {
  const omo = job.OMO || job.omo || job.id;
  const itbFile = recovered.get(omo);
  if (!itbFile) continue;

  const currentItb = String(job.ITBFile || job.itbFile || "").trim();

  if (!currentItb) {
    job.ITBFile = itbFile;
    job.itbFile = itbFile;
    job.MissingITBReason = "";
    job.missingITBReason = "";

    if (String(job.ITBMatchStatus || job.itbMatchStatus || "").toUpperCase() === "NO_ITB" || !job.ITBMatchStatus) {
      job.ITBMatchStatus = "RECOVERED_ITB";
      job.itbMatchStatus = "RECOVERED_ITB";
    }

    if (String(job.status || "").toUpperCase() === "NO_ITB") {
      job.status = "RECOVERED_ITB";
    }

    jsonPatched += 1;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(Array.isArray(data) ? jobs : data, null, 2), "utf8");

console.log("JSON patched rows:", jsonPatched);

const csvLines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(csvLines[0]);

function ensureHeader(name) {
  let idx = headers.indexOf(name);
  if (idx === -1) {
    headers.push(name);
    idx = headers.length - 1;
  }
  return idx;
}

const csvOmoIdx = headers.indexOf("OMO");
const csvItbIdx = ensureHeader("ITBFile");
const csvMissingIdx = ensureHeader("MissingITBReason");
const csvMatchIdx = ensureHeader("ITBMatchStatus");
const csvStatusIdx = ensureHeader("status");

let csvPatched = 0;
const outLines = [headers.map(csvEscape).join(",")];

for (const line of csvLines.slice(1)) {
  const cols = parseCsvLine(line);
  while (cols.length < headers.length) cols.push("");

  const omo = cols[csvOmoIdx];
  const itbFile = recovered.get(omo);

  if (itbFile && !String(cols[csvItbIdx] || "").trim()) {
    cols[csvItbIdx] = itbFile;
    cols[csvMissingIdx] = "";

    if (String(cols[csvMatchIdx] || "").toUpperCase() === "NO_ITB" || !cols[csvMatchIdx]) {
      cols[csvMatchIdx] = "RECOVERED_ITB";
    }

    if (String(cols[csvStatusIdx] || "").toUpperCase() === "NO_ITB") {
      cols[csvStatusIdx] = "RECOVERED_ITB";
    }

    csvPatched += 1;
  }

  outLines.push(cols.map(csvEscape).join(","));
}

fs.writeFileSync(csvPath, outLines.join("\n"), "utf8");

console.log("CSV patched rows:", csvPatched);
console.log("Backups created:");
console.log(backupJson);
console.log(backupCsv);
