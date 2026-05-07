const https = require("https");

https.get("https://hpd-bid-dashboard-2026.onrender.com/api/jobs?v=no-itb-check", (res) => {
  let raw = "";

  res.on("data", (chunk) => raw += chunk);

  res.on("end", () => {
    const data = JSON.parse(raw);
    const jobs = Array.isArray(data) ? data : (data.jobs || []);

    const noItb = jobs.filter((j) => {
      const status = String(j.ITBMatchStatus || j.itbMatchStatus || j.status || "").toUpperCase();
      const reason = String(j.MissingITBReason || j.missingITBReason || "").toUpperCase();
      return status.includes("NO_ITB") || reason.includes("NO ITB");
    });

    console.log("Total jobs:", jobs.length);
    console.log("NO_ITB jobs:", noItb.length);

    console.table(noItb.map((j) => ({
      OMO: j.OMO || j.id,
      Address: j.BuildingAddress || j.address,
      AwardDate: j.AwardDate || j.awardDate,
      COAFile: j.COAFile || j.coaFile,
      ITBFile: j.ITBFile || j.itbFile,
      MissingReason: j.MissingITBReason || j.missingITBReason,
      Status: j.ITBMatchStatus || j.itbMatchStatus || j.status
    })));
  });
});
