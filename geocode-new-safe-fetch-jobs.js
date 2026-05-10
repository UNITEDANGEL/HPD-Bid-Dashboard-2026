const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_osm_geocode_30_new.json";

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

function hasGoodCoords(job) {
  const lat = Number(get(job, "Latitude", "latitude", "lat"));
  const lng = Number(get(job, "Longitude", "longitude", "lng", "lon"));
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 40.45 && lat <= 40.95 &&
    lng >= -74.35 && lng <= -73.65;
}

async function geocode(address) {
  const q = `${address}, New York City, NY`;
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
    encodeURIComponent(q);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "HPD-Bid-Dashboard-2026 local geocoder"
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const rows = await res.json();
  if (!rows.length) return null;

  const lat = Number(rows[0].lat);
  const lng = Number(rows[0].lon);

  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 40.45 && lat <= 40.95 &&
    lng >= -74.35 && lng <= -73.65
  ) {
    return { lat, lng };
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const targets = jobs.filter((job) =>
    get(job, "FetchMergeSource", "fetchMergeSource") === "SAFE_7DAY_FETCH" &&
    !hasGoodCoords(job)
  );

  console.log("Need geocode:", targets.length);

  let patched = 0;
  let failed = 0;

  for (const job of targets) {
    const omo = get(job, "OMO", "id");
    const address = get(job, "BuildingAddress", "address");

    try {
      const result = await geocode(address);

      if (!result) {
        console.log("FAILED", omo, address);
        job.Geocode = "OSM_FAILED";
        job.geocode = "OSM_FAILED";
        failed += 1;
      } else {
        job.Latitude = String(result.lat);
        job.Longitude = String(result.lng);
        job.latitude = String(result.lat);
        job.longitude = String(result.lng);
        job.Geocode = "OSM_OK";
        job.geocode = "OSM_OK";
        patched += 1;
        console.log("OK", omo, address, result.lat, result.lng);
      }
    } catch (err) {
      console.log("ERROR", omo, address, err.message);
      job.Geocode = "OSM_ERROR";
      job.geocode = "OSM_ERROR";
      failed += 1;
    }

    await sleep(1200);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

  console.log("Geocoded:", patched);
  console.log("Failed:", failed);
  console.log("Backup:", backupPath);
})();
