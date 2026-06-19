const https = require("https");

const url = "https://hpd-bid-dashboard-2026.onrender.com/api/jobs?v=live-map-check-" + Date.now();

function get(j, ...keys) {
  for (const k of keys) {
    const v = j[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function insideNYC(j) {
  const lat = Number(get(j, "Latitude", "latitude", "_lat"));
  const lng = Number(get(j, "Longitude", "longitude", "_lng"));

  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 40.4774 &&
    lat <= 40.9176 &&
    lng >= -74.2591 &&
    lng <= -73.7004;
}

https.get(url, (res) => {
  let raw = "";
  res.on("data", (c) => raw += c);
  res.on("end", () => {
    const data = JSON.parse(raw);
    const jobs = Array.isArray(data) ? data : (data.jobs || []);

    const withCoords = jobs.filter((j) =>
      get(j, "Latitude", "latitude", "_lat") &&
      get(j, "Longitude", "longitude", "_lng")
    );

    const inside = jobs.filter(insideNYC);
    const outside = jobs.filter((j) =>
      get(j, "Latitude", "latitude", "_lat") &&
      get(j, "Longitude", "longitude", "_lng") &&
      !insideNYC(j)
    );

    console.log("HTTP:", res.statusCode);
    console.log("Live API jobs:", jobs.length);
    console.log("Live with coords:", withCoords.length);
    console.log("Live inside NYC:", inside.length);
    console.log("Live outside NYC:", outside.length);

    console.table(outside.slice(0, 20).map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      Lat: get(j, "Latitude", "latitude", "_lat"),
      Lng: get(j, "Longitude", "longitude", "_lng"),
      Status: get(j, "StatusOverride", "status", "ITBMatchStatus")
    })));
  });
});
