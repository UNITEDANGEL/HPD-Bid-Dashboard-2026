const fs = require("fs");

const jobs = JSON.parse(fs.readFileSync("./data/COA_Fetcher_2026.json", "utf8"));
const DESC_KEYS = [
  "ItbPage3Description",
  "itbPage3Description",
  "description",
  "JobDescription",
  "Job_Description",
  "Job Description",
  "Description",
  "WorkDescription",
  "ScopeOfWork"
];

function get(job, ...keys) {
  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function isBadDescription(desc) {
  const text = String(desc || "").toLowerCase();

  return (
    text.includes("job description on omo") ||
    text.includes("no bids will be accepted") ||
    text.includes("bids will be deemed non-responsive") ||
    text.includes("invitation to bid quotation sheet") ||
    text.includes("bid certification") ||
    text.includes("scope of work is described on the attached copy") ||
    text.includes("you must certify your bid price") ||
    /^page\s+\d+\s+of\s+\d+/i.test(desc)
  );
}

const bad = jobs.filter((job) => {
  const desc = get(job, ...DESC_KEYS);
  return desc && isBadDescription(desc);
});

const missing = jobs.filter((job) => {
  const desc = get(job, ...DESC_KEYS);
  const status = get(job, "ITBMatchStatus", "itbMatchStatus", "status").toUpperCase();
  const itb = get(job, "ITBFile", "itbFile");
  return !desc && status !== "NO_ITB" && itb;
});

const sourceReview = jobs.filter((job) => job.DescriptionNeedsSourceReview || job.descriptionNeedsSourceReview);

console.log("Bad/boilerplate descriptions:", bad.length);
console.log("Missing descriptions:", missing.length);
console.log("Source review jobs:", sourceReview.length);

console.log("\nBad sample:");
console.table(bad.slice(0, 50).map((j) => ({
  OMO: get(j, "OMO", "id"),
  Address: get(j, "BuildingAddress", "address"),
  ITB: get(j, "ITBFile", "itbFile"),
  Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status"),
  Source: get(j, "DescriptionSource", "descriptionSource"),
  Preview: get(j, ...DESC_KEYS).slice(0, 100)
})));

console.log("\nSource review sample:");
console.table(sourceReview.slice(0, 20).map((j) => ({
  OMO: get(j, "OMO", "id"),
  Address: get(j, "BuildingAddress", "address"),
  ITB: get(j, "ITBFile", "itbFile"),
  Status: get(j, "ItbPage3VerificationStatus", "itbPage3VerificationStatus", "ITBMatchStatus", "status"),
  Source: get(j, "DescriptionSource", "descriptionSource"),
  Preview: get(j, ...DESC_KEYS).slice(0, 100)
})));

console.log("\nMissing sample:");
console.table(missing.slice(0, 20).map((j) => ({
  OMO: get(j, "OMO", "id"),
  Address: get(j, "BuildingAddress", "address"),
  ITB: get(j, "ITBFile", "itbFile"),
  Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
})));


