const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_manual_geocode_11_new.json";

fs.copyFileSync(jsonPath, backupPath);

const jobs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const coords = {
  EQ27145: { lat: 40.8588, lng: -73.9277 }, // 681 West 193 Street, 10040
  EQ26424: { lat: 40.7354, lng: -73.8675 }, // 94-30 59 Avenue, 11373
  EQ26843: { lat: 40.7130, lng: -73.9609 }, // 154 South 3 Street, 11211
  EQ26361: { lat: 40.8178, lng: -73.9415 }, // 2441 Adam C Powell Blvd, 10030
  EQ26835: { lat: 40.6670, lng: -73.7637 }, // 140-11 183 Street, 11413
  EQ26587: { lat: 40.6410, lng: -73.9954 }, // 1145 45 Street, 11219
  EQ26478: { lat: 40.8537, lng: -73.9294 }, // 561 West 186 Street, 10033
  EQ26595: { lat: 40.6406, lng: -73.9896 }, // 1228 39 Street, 11218
  EQ26389: { lat: 40.8087, lng: -73.9505 }, // 2258 Adam C Powell Blvd, 10027
  EQ26148: { lat: 40.7050, lng: -73.8010 }, // 153-19 89 Avenue, 11432
  EQ10332: { lat: 40.8253, lng: -73.8911 }, // 1155 East 165 Street, 10459
};

let patched = 0;

for (const job of jobs) {
  const omo = job.OMO || job.id;
  const c = coords[omo];
  if (!c) continue;

  job.Latitude = String(c.lat);
  job.Longitude = String(c.lng);
  job.latitude = String(c.lat);
  job.longitude = String(c.lng);
  job.Geocode = "MANUAL_NYC_APPROX";
  job.geocode = "MANUAL_NYC_APPROX";

  patched += 1;
}

fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

console.log("Manual geocodes patched:", patched);
console.log("Backup:", backupPath);
