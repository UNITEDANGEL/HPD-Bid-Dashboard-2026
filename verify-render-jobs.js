const https = require("https");

https.get("https://hpd-bid-dashboard-2026.onrender.com/api/jobs?v=verify-node", (res) => {
  let raw = "";

  res.on("data", (chunk) => raw += chunk);

  res.on("end", () => {
    const data = JSON.parse(raw);
    const jobs = Array.isArray(data) ? data : (data.jobs || []);

    console.log("HTTP status:", res.statusCode);
    console.log("Render job count:", jobs.length);

    const only2026 = jobs.filter((j) =>
      String(j.AwardDate || j.awardDate || "").match(/\/26|2026/) ||
      String(j.WorkStartDate || j.workStartDate || "").match(/\/26|2026/) ||
      String(j.WorkCompletionDate || j.workCompletionDate || "").match(/\/26|2026/)
    );

    const mapped = jobs.filter((j) =>
      (j.Latitude || j.latitude) &&
      (j.Longitude || j.longitude)
    );

    const statuses = jobs.filter((j) =>
      j.StatusOverride || j.status || j.ITBMatchStatus || j.itbMatchStatus
    );

    console.log("2026 rows:", only2026.length);
    console.log("Mapped rows:", mapped.length);
    console.log("Status rows:", statuses.length);

    console.log("First 3:");
    console.table(jobs.slice(0, 3).map((j) => ({
      OMO: j.OMO || j.omo || j.id,
      Address: j.BuildingAddress || j.address,
      AwardDate: j.AwardDate || j.awardDate,
      Latitude: j.Latitude || j.latitude,
      Longitude: j.Longitude || j.longitude,
      Status: j.StatusOverride || j.status || j.ITBMatchStatus || j.itbMatchStatus
    })));
  });
});
