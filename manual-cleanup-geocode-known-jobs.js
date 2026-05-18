const fs = require("fs");
const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_manual_cleanup_geocode.json";
const jobs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
fs.copyFileSync(jsonPath, backupPath);
const manual = {
  "EQ27013": { lat: 40.87233, lng: -73.87942, note: "3144 HULL AVENUE, 10467" },
  "EQ27383": { lat: 40.70892, lng: -73.80858, note: "150-73 87 AVENUE, 11432" },
  "EQ27076": { lat: 40.79491, lng: -73.94237, note: "237 EAST 111 STREET, 10029" },
  "EQ27780": { lat: 40.81634, lng: -73.89972, note: "672 BECK STREET, 10455" },
  "EQ27724": { lat: 40.72526, lng: -73.90149, note: "53-44 63 STREET, 11378" },
  "EQ27725": { lat: 40.72126, lng: -73.87097, note: "84-49 64 ROAD, 11379" },
  "EQ27202": { lat: 40.85567, lng: -73.88787, note: "2378 HOFFMAN STREET, 10458" },
  "EQ27737": { lat: 40.71977, lng: -73.94439, note: "57 HERBERT STREET, 11222" },
  "EQ27108": { lat: 40.61975, lng: -74.08082, note: "160 PARKHILL AVENUE, 10304" },
  "EQ27459": { lat: 40.75061, lng: -73.86637, note: "38-19 99 STREET, 11368" },
  "EQ27267": { lat: 40.60836, lng: -73.95471, note: "1909 QUENTIN ROAD, 11229" },
  "EQ27468": { lat: 40.75116, lng: -73.85969, note: "108-07 44 AVENUE, 11368" }
};
function get(job, ...keys) {
  for (const key of keys) {
    const value = job[key];
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
let patched = 0;
for (const job of jobs) {
  const omo = get(job, "OMO", "id");
  const fix = manual[omo];
  if (!fix || hasGoodCoords(job)) continue;
  job.Latitude = String(fix.lat);
  job.Longitude = String(fix.lng);
  job.latitude = String(fix.lat);
  job.longitude = String(fix.lng);
  job.Geocode = "MANUAL_CLEANUP_OK";
  job.geocode = "MANUAL_CLEANUP_OK";
  job.GeocodeNote = fix.note;
  job.geocodeNote = fix.note;
  patched += 1;
  console.log("MANUAL GEO OK", omo, fix.note, fix.lat, fix.lng);
}
fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");
console.log("Manual geocode patched:", patched);
console.log("Backup:", backupPath);
