const fs = require("fs");
const path = require("path");

const input = "./data/missing_itb_recovery_matches.csv";
const output = "./data/missing_itb_best_matches.csv";

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

const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines[0]);

const omoIndex = headers.indexOf("OMO");
const addressIndex = headers.indexOf("Address");
const coaIndex = headers.indexOf("COAFile");
const matchIndex = headers.indexOf("PossibleITBMatch");
const typeIndex = headers.indexOf("MatchType");

const best = new Map();

for (const line of lines.slice(1)) {
  const cols = parseCsvLine(line);

  const omo = cols[omoIndex];
  const address = cols[addressIndex];
  const coaFile = cols[coaIndex];
  const match = cols[matchIndex];
  const matchType = cols[typeIndex];

  if (matchType !== "FILENAME_OMO_MATCH") continue;
  if (!match) continue;

  const normalized = match.replace(/\\/g, "/").toUpperCase();

  // Keep only actual ITB folder matches, reject COA matches.
  if (!normalized.includes("/ITB_DOWNLOADS_V5/")) continue;
  if (normalized.includes("/COA_DOWNLOADS_V5/")) continue;

  const fileName = path.basename(match);

  // Prefer original over duplicate "(1)".
  const score = fileName.includes("(1)") ? 2 : 1;

  if (!best.has(omo) || score < best.get(omo).score) {
    best.set(omo, {
      omo,
      address,
      coaFile,
      itbPath: match,
      itbFile: fileName,
      score,
    });
  }
}

const rows = [
  ["OMO", "Address", "COAFile", "RecoveredITBFile", "RecoveredITBPath"].join(",")
];

for (const row of [...best.values()].sort((a, b) => a.omo.localeCompare(b.omo))) {
  rows.push([
    row.omo,
    row.address,
    row.coaFile,
    row.itbFile,
    row.itbPath,
  ].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
}

fs.writeFileSync(output, rows.join("\n"), "utf8");

console.log("Clean ITB matches:", best.size);
console.log("Exported:", output);
console.table([...best.values()].slice(0, 20).map((r) => ({
  OMO: r.omo,
  ITBFile: r.itbFile,
  Address: r.address,
})));
