const fs = require("fs");
const path = require("path");

const missingCsv = "./data/missing_itb_jobs_2026.csv";
const searchRoot = "G:/My Drive/HPD_Bid_Management_Project";
const outCsv = "./data/missing_itb_recovery_matches.csv";

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

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);

    if (item.isDirectory()) {
      walk(full, files);
    } else if (item.isFile() && item.name.toLowerCase().endsWith(".pdf")) {
      files.push(full);
    }
  }

  return files;
}

const lines = fs.readFileSync(missingCsv, "utf8").split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines[0]);
const omoIndex = headers.indexOf("OMO");
const addressIndex = headers.indexOf("BuildingAddress");
const coaIndex = headers.indexOf("COAFile");

const missing = lines.slice(1).map((line) => {
  const cols = parseCsvLine(line);
  return {
    omo: cols[omoIndex],
    address: cols[addressIndex],
    coaFile: cols[coaIndex],
  };
});

console.log("Missing ITB jobs to search:", missing.length);
console.log("Scanning:", searchRoot);

const pdfs = walk(searchRoot);
console.log("PDF files scanned:", pdfs.length);

const rows = [
  ["OMO", "Address", "COAFile", "PossibleITBMatch", "MatchType"].join(",")
];

let matched = 0;

for (const job of missing) {
  const omo = String(job.omo || "").toUpperCase();
  const matches = pdfs.filter((file) => {
    const base = path.basename(file).toUpperCase();
    return base.includes(omo) && !base.includes("COA");
  });

  if (matches.length) {
    matched += 1;

    for (const match of matches) {
      rows.push([
        job.omo,
        job.address,
        job.coaFile,
        match,
        "FILENAME_OMO_MATCH"
      ].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
    }
  } else {
    rows.push([
      job.omo,
      job.address,
      job.coaFile,
      "",
      "NO_FILENAME_MATCH"
    ].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
  }
}

fs.writeFileSync(outCsv, rows.join("\n"), "utf8");

console.log("Jobs with possible ITB matches:", matched);
console.log("Exported:", outCsv);
