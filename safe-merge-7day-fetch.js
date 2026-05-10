const fs = require("fs");

const masterPath = "./data/COA_Fetcher_2026.json";
const incomingPath = "./mereged_data_csv_2025/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_safe_7day_merge.json";
const reportPath = "./data/safe_7day_merge_report.json";

fs.copyFileSync(masterPath, backupPath);

const master = JSON.parse(fs.readFileSync(masterPath, "utf8"));
const incoming = JSON.parse(fs.readFileSync(incomingPath, "utf8"));

function get(obj, ...keys) {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function hasGoodCoords(job) {
  const lat = Number(get(job, "Latitude", "latitude", "lat"));
  const lng = Number(get(job, "Longitude", "longitude", "lng", "lon"));
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 40.45 && lat <= 40.95 &&
    lng >= -74.35 && lng <= -73.65;
}

function isBadDescription(desc) {
  const text = String(desc || "").toLowerCase();
  return (
    !text ||
    text.includes("job description on omo") ||
    text.includes("no bids will be accepted") ||
    text.includes("bids will be deemed non-responsive") ||
    text.includes("invitation to bid quotation sheet") ||
    text.includes("bid certification") ||
    text.includes("scope of work is described on the attached copy") ||
    text.includes("you must certify your bid price") ||
    /^page\s+\d+\s+of\s+\d+/i.test(String(desc || ""))
  );
}

function normalizeIncoming(row) {
  const out = { ...row };

  const desc = get(out, "JobDescription", "description", "Job_Description");
  const itb = get(out, "ITBFile", "itbFile");
  const status = get(out, "ITBMatchStatus", "itbMatchStatus", "status");

  out.OMO = get(out, "OMO", "id");
  out.id = out.OMO;

  out.COAFile = get(out, "COAFile", "coaFile");
  out.coaFile = out.COAFile;

  out.ITBFile = itb;
  out.itbFile = itb;

  out.JobDescription = isBadDescription(desc) ? "" : desc;
  out.description = out.JobDescription;
  out.Job_Description = out.JobDescription;

  out.ITBMatchStatus = status || (itb ? "MATCHED" : "NO_ITB");
  out.itbMatchStatus = out.ITBMatchStatus;
  out.status = out.status || out.ITBMatchStatus;

  if (!hasGoodCoords(out)) {
    out.Geocode = "NEEDS_GEOCODE";
    out.geocode = "NEEDS_GEOCODE";
    out.Latitude = "";
    out.Longitude = "";
    out.latitude = "";
    out.longitude = "";
  }

  if (!itb) {
    out.MissingITBReason = "Needs ITB recovery after 7-day fetch";
    out.missingITBReason = out.MissingITBReason;
  }

  if (!out.JobDescription) {
    out.DescriptionNeedsReview = true;
    out.descriptionNeedsReview = true;
  }

  out.FetchMergeSource = "SAFE_7DAY_FETCH";
  out.fetchMergeSource = "SAFE_7DAY_FETCH";

  return out;
}

const masterByOmo = new Map();
for (const row of master) {
  const omo = get(row, "OMO", "id");
  if (omo) masterByOmo.set(omo, row);
}

const report = {
  masterBefore: master.length,
  incomingRows: incoming.length,
  added: [],
  skippedExisting: [],
  incomingNeedsGeocode: [],
  incomingMissingITB: [],
  incomingMissingDescription: []
};

for (const raw of incoming) {
  const row = normalizeIncoming(raw);
  const omo = get(row, "OMO", "id");
  if (!omo) continue;

  if (masterByOmo.has(omo)) {
    report.skippedExisting.push(omo);
    continue;
  }

  master.push(row);
  masterByOmo.set(omo, row);
  report.added.push(omo);

  if (!hasGoodCoords(row)) report.incomingNeedsGeocode.push(omo);
  if (!get(row, "ITBFile", "itbFile")) report.incomingMissingITB.push(omo);
  if (!get(row, "JobDescription", "description", "Job_Description")) {
    report.incomingMissingDescription.push(omo);
  }
}

report.masterAfter = master.length;

fs.writeFileSync(masterPath, JSON.stringify(master, null, 2), "utf8");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log("Safe merge complete");
console.log("Master before:", report.masterBefore);
console.log("Incoming rows:", report.incomingRows);
console.log("Added new OMOs:", report.added.length);
console.log("Skipped existing OMOs:", report.skippedExisting.length);
console.log("Need geocode:", report.incomingNeedsGeocode.length);
console.log("Missing ITB:", report.incomingMissingITB.length);
console.log("Missing description:", report.incomingMissingDescription.length);
console.log("Master after:", report.masterAfter);
console.log("Backup:", backupPath);
console.log("Report:", reportPath);
