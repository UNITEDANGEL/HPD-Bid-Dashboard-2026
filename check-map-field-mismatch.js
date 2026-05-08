const https = require("https");

const url = "https://hpd-bid-dashboard-2026.onrender.com/api/jobs?v=field-check-" + Date.now();

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

    const nixon = jobs.filter((j) =>
      get(j, "BuildingAddress", "address").toUpperCase().includes("NIXON")
    );

    const noDescription = jobs.filter((j) =>
      !get(j, "JobDescription", "description", "Job_Description")
    );

    const noItbByLowercaseOnly = jobs.filter((j) =>
      !get(j, "itbFile") && get(j, "ITBFile")
    );

    console.log("Total jobs:", jobs.length);
    console.log("Nixon rows:", nixon.length);
    console.log("Rows with no description:", noDescription.length);
    console.log("Rows where uppercase ITBFile exists but lowercase itbFile is blank:", noItbByLowercaseOnly.length);

    console.log("\nNIXON:");
    console.table(nixon.map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      ITBFile_UPPER: j.ITBFile || "",
      itbFile_lower: j.itbFile || "",
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status"),
      MissingReason: get(j, "MissingITBReason", "missingITBReason"),
      DescriptionLength: get(j, "JobDescription", "description", "Job_Description").length
    })));

    console.log("\nNO DESCRIPTION SAMPLE:");
    console.table(noDescription.slice(0, 30).map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      COAFile: get(j, "COAFile", "coaFile"),
      ITBFile: get(j, "ITBFile", "itbFile"),
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
    })));

    console.log("\nUPPERCASE ITB ONLY SAMPLE:");
    console.table(noItbByLowercaseOnly.slice(0, 30).map((j) => ({
      OMO: get(j, "OMO", "id"),
      Address: get(j, "BuildingAddress", "address"),
      ITBFile_UPPER: j.ITBFile || "",
      itbFile_lower: j.itbFile || "",
      Status: get(j, "ITBMatchStatus", "itbMatchStatus", "status")
    })));
  });
});
