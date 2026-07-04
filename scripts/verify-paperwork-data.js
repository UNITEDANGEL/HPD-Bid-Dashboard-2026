const fs = require("fs");
const path = require("path");

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const writeReport = args.has("--write-report");

const dataPath = path.join(root, "data", "COA_Fetcher_2026.json");
const publicDataPath = path.join(root, "public", "data", "COA_Fetcher_2026.json");
const manifestPath = path.join(root, "public", "data", "itb_source_manifest.json");

const DESCRIPTION_KEYS = [
  "ItbPage3Description",
  "itbPage3Description",
  "description",
  "JobDescription",
  "Job_Description",
  "Job Description",
  "Description",
  "WorkDescription",
  "ScopeOfWork",
];

const ADDRESS_KEYS = [
  "BuildingAddress",
  "address",
  "Address",
  "Building Address",
  "Building_Address",
  "Location",
  "location",
];

const ID_KEYS = ["OMO", "omo", "id", "jobId", "Job ID"];
const ITB_KEYS = ["ITBFile", "itbFile", "ITB File", "ITB"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function get(job, keys) {
  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function isWorkOrderId(value) {
  return /^[A-Z]{2}\d+/i.test(String(value || "").trim());
}

function isBadDescription(value) {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("job description on omo") ||
    text.includes("no bids will be accepted") ||
    text.includes("bids will be deemed non-responsive") ||
    text.includes("invitation to bid quotation sheet") ||
    text.includes("bid certification") ||
    text.includes("scope of work is described on the attached copy") ||
    text.includes("you must certify your bid price") ||
    /^page\s+\d+\s+of\s+\d+/i.test(String(value || "").trim())
  );
}

function cleanItbFile(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const fileName = value.split(/[\\/]/).pop().trim();
  return /\.pdf$/i.test(fileName) ? fileName : "";
}

function summarizeJob(job) {
  const omo = get(job, ID_KEYS);
  return {
    OMO: omo,
    Address: get(job, ADDRESS_KEYS),
    ITB: get(job, ITB_KEYS),
    Source: get(job, ["ItbPage3DescriptionSource", "DescriptionSource", "descriptionSource"]),
    Status: get(job, ["ItbPage3VerificationStatus", "itbPage3VerificationStatus", "ITBMatchStatus", "itbMatchStatus"]),
    Preview: get(job, DESCRIPTION_KEYS).replace(/\s+/g, " ").slice(0, 140),
  };
}

function auditRows(rows, manifest) {
  const entries = manifest?.entries || {};
  const jobs = rows.filter((job) => isWorkOrderId(get(job, ID_KEYS)));

  const missingAddresses = [];
  const missingDescriptions = [];
  const badDescriptions = [];
  const sourceReviewJobs = [];
  const missingItbFiles = [];
  const missingPage3Images = [];

  for (const job of jobs) {
    const description = get(job, DESCRIPTION_KEYS);
    const address = get(job, ADDRESS_KEYS);
    const itbFile = cleanItbFile(get(job, ITB_KEYS));
    const status = get(job, ["ITBMatchStatus", "itbMatchStatus", "status"]).toUpperCase();
    const needsSourceReview = Boolean(job.DescriptionNeedsSourceReview || job.descriptionNeedsSourceReview);

    if (!address) missingAddresses.push(summarizeJob(job));
    if (!description && status !== "NO_ITB" && itbFile) missingDescriptions.push(summarizeJob(job));
    if (description && isBadDescription(description)) badDescriptions.push(summarizeJob(job));
    if (needsSourceReview) sourceReviewJobs.push(summarizeJob(job));
    if (!itbFile && status !== "NO_ITB") missingItbFiles.push(summarizeJob(job));

    const entry = itbFile ? entries[itbFile] : null;
    const pageImage = entry?.pageImage || "";
    if (itbFile && !needsSourceReview && (!entry || !pageImage)) {
      missingPage3Images.push(summarizeJob(job));
    }
  }

  return {
    totalJobs: jobs.length,
    missingAddresses,
    missingDescriptions,
    badDescriptions,
    sourceReviewJobs,
    missingItbFiles,
    missingPage3Images,
  };
}

function sameCriticalCounts(left, right) {
  return (
    left.totalJobs === right.totalJobs &&
    left.missingAddresses.length === right.missingAddresses.length &&
    left.missingDescriptions.length === right.missingDescriptions.length &&
    left.badDescriptions.length === right.badDescriptions.length &&
    left.sourceReviewJobs.length === right.sourceReviewJobs.length
  );
}

function printTable(title, rows) {
  console.log(`\n${title}:`);
  if (!rows.length) {
    console.log("(none)");
    return;
  }
  console.table(rows.slice(0, 25));
}

const rows = readJson(dataPath);
const publicRows = fs.existsSync(publicDataPath) ? readJson(publicDataPath) : [];
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};

const report = auditRows(rows, manifest);
const publicReport = Array.isArray(publicRows) ? auditRows(publicRows, manifest) : null;
const publicDataInSync = publicReport ? sameCriticalCounts(report, publicReport) : false;

const output = {
  generatedAt: new Date().toISOString(),
  totalJobs: report.totalJobs,
  missingAddresses: report.missingAddresses.length,
  missingDescriptions: report.missingDescriptions.length,
  badDescriptions: report.badDescriptions.length,
  sourceReviewJobs: report.sourceReviewJobs.length,
  missingItbFiles: report.missingItbFiles.length,
  missingPage3Images: report.missingPage3Images.length,
  publicDataInSync,
  samples: {
    missingAddresses: report.missingAddresses.slice(0, 25),
    missingDescriptions: report.missingDescriptions.slice(0, 25),
    badDescriptions: report.badDescriptions.slice(0, 25),
    sourceReviewJobs: report.sourceReviewJobs.slice(0, 25),
    missingItbFiles: report.missingItbFiles.slice(0, 25),
    missingPage3Images: report.missingPage3Images.slice(0, 25),
  },
};

console.log("PAPERWORK DATA QUALITY");
console.log(`Total jobs: ${output.totalJobs}`);
console.log(`Missing addresses: ${output.missingAddresses}`);
console.log(`Missing descriptions: ${output.missingDescriptions}`);
console.log(`Bad/boilerplate descriptions: ${output.badDescriptions}`);
console.log(`Source review jobs: ${output.sourceReviewJobs}`);
console.log(`Missing ITB files: ${output.missingItbFiles}`);
console.log(`Missing page 3 images: ${output.missingPage3Images}`);
console.log(`Public data in sync: ${output.publicDataInSync ? "yes" : "no"}`);

printTable("Source review sample", report.sourceReviewJobs);
printTable("Missing address sample", report.missingAddresses);
printTable("Missing description sample", report.missingDescriptions);
printTable("Bad description sample", report.badDescriptions);

if (writeReport) {
  const files = [
    path.join(root, "data", "paperwork_data_quality.json"),
    path.join(root, "public", "data", "paperwork_data_quality.json"),
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
}

const criticalIssues = [];
if (report.missingAddresses.length) criticalIssues.push(`missingAddresses=${report.missingAddresses.length}`);
if (report.missingDescriptions.length) criticalIssues.push(`missingDescriptions=${report.missingDescriptions.length}`);
if (report.badDescriptions.length) criticalIssues.push(`badDescriptions=${report.badDescriptions.length}`);
if (report.missingItbFiles.length) criticalIssues.push(`missingItbFiles=${report.missingItbFiles.length}`);
if (!publicDataInSync) criticalIssues.push("publicDataInSync=false");

if (strict && criticalIssues.length) {
  console.error("PAPERWORK DATA QUALITY FAILED:");
  for (const issue of criticalIssues) console.error(`- ${issue}`);
  process.exit(1);
}

if (report.sourceReviewJobs.length) {
  console.warn(`PAPERWORK DATA QUALITY WARNING: sourceReviewJobs=${report.sourceReviewJobs.length}.`);
}

console.log(strict ? "PAPERWORK DATA QUALITY PASSED" : "PAPERWORK DATA QUALITY CHECKED");
