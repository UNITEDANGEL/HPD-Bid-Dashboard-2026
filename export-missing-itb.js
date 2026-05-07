const fs = require("fs");

const source = "./data/COA_Fetcher_2026.json";
const out = "./data/missing_itb_jobs_2026.csv";

const raw = fs.readFileSync(source, "utf8");
const data = JSON.parse(raw);
const jobs = Array.isArray(data) ? data : (data.jobs || []);

function val(job, ...keys) {
  for (const key of keys) {
    if (job[key] !== undefined && job[key] !== null && String(job[key]).trim() !== "") {
      return String(job[key]).replace(/"/g, '""');
    }
  }
  return "";
}

const missing = jobs.filter((job) => {
  const status = val(job, "ITBMatchStatus", "itbMatchStatus", "status").toUpperCase();
  const reason = val(job, "MissingITBReason", "missingITBReason").toUpperCase();
  const itb = val(job, "ITBFile", "itbFile").trim();

  return status.includes("NO_ITB") || reason.includes("NO ITB") || !itb;
});

const headers = [
  "OMO",
  "BuildingAddress",
  "AwardDate",
  "WorkStartDate",
  "WorkCompletionDate",
  "COAFile",
  "ITBFile",
  "MissingITBReason",
  "ITBMatchStatus",
  "StatusOverride",
  "Status"
];

const lines = [
  headers.join(","),
  ...missing.map((job) => headers.map((h) => {
    const value =
      h === "Status" ? val(job, "status") :
      val(job, h, h.charAt(0).toLowerCase() + h.slice(1));
    return `"${value}"`;
  }).join(","))
];

fs.writeFileSync(out, lines.join("\n"), "utf8");

console.log("Total jobs:", jobs.length);
console.log("Missing ITB jobs:", missing.length);
console.log("Exported:", out);
console.table(missing.slice(0, 10).map((j) => ({
  OMO: val(j, "OMO", "id"),
  Address: val(j, "BuildingAddress", "address"),
  COAFile: val(j, "COAFile", "coaFile"),
  ITBFile: val(j, "ITBFile", "itbFile"),
  Status: val(j, "ITBMatchStatus", "itbMatchStatus", "status")
})));
