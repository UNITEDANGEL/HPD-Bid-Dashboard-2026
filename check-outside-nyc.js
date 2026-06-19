const fs = require("fs");

const jobs = JSON.parse(fs.readFileSync("./data/COA_Fetcher_2026.json", "utf8"));

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

// Tight NYC bounding box:
// Staten Island south/west through Bronx/Queens east/north
function isInsideNyc(job) {
  const lat = Number(get(job, "Latitude", "latitude"));
  const lng = Number(get(job, "Longitude", "longitude"));

  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 40.4774 &&
    lat <= 40.9176 &&
    lng >= -74.2591 &&
    lng <= -73.7004;
}

const rows2026 = jobs.filter(is2026);
const outside = rows2026.filter((job) => !isInsideNyc(job));

console.log("2026 jobs:", rows2026.length);
console.log("Outside NYC bounds:", outside.length);

console.table(outside.map((j) => ({
  OMO: get(j, "OMO", "id"),
  Address: get(j, "BuildingAddress", "address"),
  Borough: get(j, "borough", "Boro"),
  AwardDate: get(j, "AwardDate", "awardDate"),
  Latitude: get(j, "Latitude", "latitude"),
  Longitude: get(j, "Longitude", "longitude"),
  Geocode: get(j, "Geocode", "geocode"),
  Status: get(j, "StatusOverride", "status", "ITBMatchStatus")
})));

const csv = [
  "OMO,Address,Borough,AwardDate,Latitude,Longitude,Geocode,Status",
  ...outside.map((j) => [
    get(j, "OMO", "id"),
    get(j, "BuildingAddress", "address"),
    get(j, "borough", "Boro"),
    get(j, "AwardDate", "awardDate"),
    get(j, "Latitude", "latitude"),
    get(j, "Longitude", "longitude"),
    get(j, "Geocode", "geocode"),
    get(j, "StatusOverride", "status", "ITBMatchStatus")
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
];

fs.writeFileSync("./data/outside_nyc_mapped_jobs.csv", csv.join("\n"), "utf8");
console.log("Exported: ./data/outside_nyc_mapped_jobs.csv");
