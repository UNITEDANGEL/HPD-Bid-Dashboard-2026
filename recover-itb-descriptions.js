const fs = require("fs");
const path = require("path");
const child_process = require("child_process");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_description_recovery.json";
const itbRoot = "G:/My Drive/HPD_Bid_Management_Project/Scripts/Diagnostics script/ITB_Downloads_V5";

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

function findPdfByName(fileName) {
  if (!fileName) return "";
  const direct = path.join(itbRoot, fileName);
  if (fs.existsSync(direct)) return direct;

  const alt = path.join(itbRoot, fileName.replace(".pdf", " (1).pdf"));
  if (fs.existsSync(alt)) return alt;

  return "";
}

const targets = jobs.filter((job) => {
  const desc = get(job, "JobDescription", "description", "Job_Description");
  const itb = get(job, "ITBFile", "itbFile");
  return !desc && itb;
});

console.log("Jobs with ITB but no description:", targets.length);

const helperPy = "./extract_itb_text_temp.py";

fs.writeFileSync(helperPy, `
import sys
from PyPDF2 import PdfReader

path = sys.argv[1]
reader = PdfReader(path)
text = ""
for page in reader.pages:
    text += page.extract_text() or ""
print(text)
`, "utf8");

function cleanText(text) {
  return String(text || "")
    .replace(/\\r/g, "\\n")
    .replace(/[ \\t]+/g, " ")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
}

function extractJobDescription(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";

  const markers = [
    "Job Description:",
    "JOB DESCRIPTION:",
    "Job Description",
    "JOB DESCRIPTION"
  ];

  let start = -1;
  let markerUsed = "";

  for (const marker of markers) {
    const idx = cleaned.indexOf(marker);
    if (idx >= 0 && (start === -1 || idx < start)) {
      start = idx;
      markerUsed = marker;
    }
  }

  if (start === -1) {
    return cleaned.slice(0, 5000);
  }

  let desc = cleaned.slice(start + markerUsed.length).trim();

  const stopMarkers = [
    "CONTRACTOR MUST CONTACT",
    "IF NO WORK IS PERFORMED",
    "IF LANDLORD REFUSES",
    "AFFIDAVIT COPY MUST BE FAXED"
  ];

  let stop = -1;
  for (const marker of stopMarkers) {
    const idx = desc.indexOf(marker);
    if (idx > 100 && (stop === -1 || idx < stop)) {
      stop = idx;
    }
  }

  if (stop > 0) desc = desc.slice(0, stop).trim();

  return desc.slice(0, 7000);
}

let patched = 0;
let missingPdf = 0;
let noExtract = 0;

for (const job of targets) {
  const itbFile = get(job, "ITBFile", "itbFile");
  const pdfPath = findPdfByName(itbFile);

  if (!pdfPath) {
    missingPdf++;
    continue;
  }

  try {
    const text = child_process.execFileSync("python", [helperPy, pdfPath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });

    const desc = extractJobDescription(text);

    if (!desc) {
      noExtract++;
      continue;
    }

    job.JobDescription = desc;
    job.description = desc;
    job.Job_Description = desc;

    patched++;
  } catch (err) {
    noExtract++;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

console.log("Description patched:", patched);
console.log("Missing PDF files:", missingPdf);
console.log("Could not extract:", noExtract);
console.log("Backup:", backupPath);
