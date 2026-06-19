const https = require("https");

const url = "https://hpd-bid-dashboard-2026.onrender.com/api/jobs?v=no-itb-live-" + Date.now();

function get(j, ...keys) {
  for (const k of keys) {
    const v = j[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

https.get(url, (res) => {
  let raw = "";
  res.on("data", (c) => raw += c);
  res.on("end", () => {
    const data = JSON.parse(raw);
    const jobs = Array.isArray(data) ? data : (data.jobs || []);

    const noItb = jobs.filter((j) => {
      const itbFile = get(j, "ITBFile", "itbFile");
      const reason = get(j, "MissingITBReason", "missingITBReason").toUpperCase();
      const status = get(j, "ITBMatchStatus", "itbMatchStatus", "status").toUpperCase();

      return status === "NO_ITB" || reason.includes("NO ITB") || (!itbFile && status === "NO_ITB");
    });

    console.log("Live jobs:", jobs.length);
    console.log("Live NO_ITB jobs:", noItb.length);

    console.table(noItb.map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      ITBFile: get(j, "ITBFile", "itbFile"),
      MissingReason: get(j, "MissingITBReason", "missingITBReason"),
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
    })));
  });
});
