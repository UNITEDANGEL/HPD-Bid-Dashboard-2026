const https = require("https");

const url = "https://hpd-bid-dashboard-2026.onrender.com/api/jobs?v=all-itb-check-" + Date.now();

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

    const realNoItb = jobs.filter((j) => {
      const reason = get(j, "MissingITBReason", "missingITBReason").toUpperCase();
      const status = get(j, "ITBMatchStatus", "itbMatchStatus", "status").toUpperCase();
      return status === "NO_ITB" || reason.includes("NO ITB FOUND");
    });

    const blankItb = jobs.filter((j) => {
      const itb = get(j, "ITBFile", "itbFile");
      return !itb;
    });

    const blankButNotRealNoItb = blankItb.filter((j) => {
      const reason = get(j, "MissingITBReason", "missingITBReason").toUpperCase();
      const status = get(j, "ITBMatchStatus", "itbMatchStatus", "status").toUpperCase();
      return !(status === "NO_ITB" || reason.includes("NO ITB FOUND"));
    });

    const nixon = jobs.filter((j) =>
      get(j, "BuildingAddress", "address").toUpperCase().includes("NIXON")
    );

    console.log("Live jobs:", jobs.length);
    console.log("Real NO_ITB:", realNoItb.length);
    console.log("Blank ITBFile:", blankItb.length);
    console.log("Blank ITBFile but NOT real NO_ITB:", blankButNotRealNoItb.length);

    console.log("\nREAL NO_ITB:");
    console.table(realNoItb.map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      ITBFile: get(j, "ITBFile", "itbFile"),
      MissingReason: get(j, "MissingITBReason", "missingITBReason"),
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
    })));

    console.log("\nBLANK ITB BUT NOT REAL NO_ITB:");
    console.table(blankButNotRealNoItb.slice(0, 80).map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      ITBFile: get(j, "ITBFile", "itbFile"),
      MissingReason: get(j, "MissingITBReason", "missingITBReason"),
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
    })));

    console.log("\nNIXON CHECK:");
    console.table(nixon.map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      ITBFile: get(j, "ITBFile", "itbFile"),
      MissingReason: get(j, "MissingITBReason", "missingITBReason"),
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
    })));
  });
});
