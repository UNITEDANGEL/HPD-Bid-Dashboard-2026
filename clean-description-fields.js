const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_description_cleanup.json";

fs.copyFileSync(jsonPath, backupPath);

const jobs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

function get(job, ...keys) {
  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +\n/g, "\n")
    .trim();
}

function isTrueBoilerplate(text) {
  const t = String(text || "").toLowerCase();

  return (
    t.includes("job description on omo") ||
    t.includes("no bids will be accepted") ||
    t.includes("bids will be deemed non-responsive") ||
    t.includes("invitation to bid quotation sheet") ||
    t.includes("bid certification") ||
    t.includes("scope of work is described on the attached copy") ||
    t.includes("you must certify your bid price")
  );
}

function extractFromExisting(desc) {
  let text = cleanText(desc);
  if (!text) return "";

  const upper = text.toUpperCase();

  const marker = "JOB DESCRIPTION";
  const idx = upper.indexOf(marker);

  if (idx >= 0) {
    text = text.slice(idx + marker.length).replace(/^[:\s]+/, "").trim();
  }

  const stopMarkers = [
    "CONTRACTOR MUST CONTACT",
    "IF NO WORK IS PERFORMED",
    "IF LANDLORD REFUSES",
    "AFFIDAVIT COPY",
    "WORK DESCRIPTION FORM",
    "PERMIT REQUIRED",
    "FORM NO.",
  ];

  const u = text.toUpperCase();
  let stop = -1;

  for (const marker of stopMarkers) {
    const pos = u.indexOf(marker);
    if (pos > 80 && (stop === -1 || pos < stop)) {
      stop = pos;
    }
  }

  if (stop > 0) {
    text = text.slice(0, stop).trim();
  }

  text = cleanText(text);

  if (text.length < 30) return "";
  if (isTrueBoilerplate(text)) return "";

  return text;
}

let cleaned = 0;
let clearedBad = 0;

for (const job of jobs) {
  const current = get(job, "JobDescription", "description", "Job_Description");
  if (!current) continue;

  const startsWithPageHeader = /^page\s+\d+\s+of\s+\d+/i.test(current);
  const hasJobDescription = /job description/i.test(current);
  const trueBoilerplate = isTrueBoilerplate(current);

  if (startsWithPageHeader || hasJobDescription || trueBoilerplate) {
    const fixed = extractFromExisting(current);

    if (fixed) {
      job.JobDescription = fixed;
      job.description = fixed;
      job.Job_Description = fixed;
      job.DescriptionSource = job.DescriptionSource || "CLEANED_ITB_DESCRIPTION";
      job.descriptionSource = job.descriptionSource || "CLEANED_ITB_DESCRIPTION";
      cleaned += 1;
    } else if (trueBoilerplate) {
      job.JobDescription = "";
      job.description = "";
      job.Job_Description = "";
      job.DescriptionNeedsReview = true;
      job.descriptionNeedsReview = true;
      clearedBad += 1;
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

console.log("Cleaned descriptions:", cleaned);
console.log("Cleared true boilerplate descriptions:", clearedBad);
console.log("Backup:", backupPath);
