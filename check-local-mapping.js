const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const raw = fs.readFileSync(jsonPath, "utf8");
const jobs = JSON.parse(raw);

function get(job, ...keys) {
  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function is2026(job) {
  return (
    /\/26|2026/.test(get(job, "AwardDate", "awardDate")) ||
    /\/26|2026/.test(get(job, "WorkStartDate", "workStartDate")) ||
    /\/26|2026/.test(get(job, "WorkCompletionDate", "workCompletionDate"))
  );
}

function hasLatLon(job) {
  return get(job, "Latitude", "latitude") && get(job, "Longitude", "longitude");
}

function validNycLatLon(job) {
  const lat = Number(get(job, "Latitude", "latitude"));
  const lon = Number(get(job, "Longitude", "longitude"));

  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat > 40 &&
    lat < 41 &&
    lon > -75 &&
    lon < -73;
}

const rows2026 = jobs.filter(is2026);
const anyLatLon = rows2026.filter(hasLatLon);
const validMapped = rows2026.filter(validNycLatLon);
const notMapped = rows2026.filter((job) => !validNycLatLon(job));

console.log("Raw JSON rows:", jobs.length);
console.log("2026 rows:", rows2026.length);
console.log("2026 rows with any Latitude/Longitude:", anyLatLon.length);
console.log("2026 rows with valid NYC coordinates:", validMapped.length);
console.log("2026 rows NOT valid mapped:", notMapped.length);

console.log("\nNot mapped sample:");
console.table(notMapped.slice(0, 30).map((j) => ({
  OMO: get(j, "OMO", "id"),
  Address: get(j, "BuildingAddress", "address"),
  AwardDate: get(j, "AwardDate", "awardDate"),
  WorkStartDate: get(j, "WorkStartDate", "workStartDate"),
  Latitude: get(j, "Latitude", "latitude"),
  Longitude: get(j, "Longitude", "longitude"),
  Geocode: get(j, "Geocode", "geocode"),
  MissingITBReason: get(j, "MissingITBReason", "missingITBReason"),
  Status: get(j, "StatusOverride", "status", "ITBMatchStatus", "itbMatchStatus")
})));
