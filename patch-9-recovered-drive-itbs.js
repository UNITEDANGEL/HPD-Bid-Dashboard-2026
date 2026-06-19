const fs = require("fs");
const path = require("path");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_recover_9_drive_itbs.json";

fs.copyFileSync(jsonPath, backupPath);

const jobs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const recovered = {
  EQ26843: "EQ26843_043026093030.pdf",
  EQ26748: "EQ26748_050126040129.pdf",
  EQ25785: "EQ25785_050126094139.pdf",
  EQ25683: "EQ25683_050126023855.pdf",
  EQ25726: "EQ25726_043026044103.pdf",
  EQ26889: "EQ26889_050126093416.pdf",
  EQ26835: "EQ26835_043026125939.pdf",
  EQ26587: "EQ26587_043026043911.pdf",
  EQ26359: "EQ26359_043026103530.pdf",
};

let patched = 0;

for (const job of jobs) {
  const omo = job.OMO || job.id;
  const itb = recovered[omo];

  if (!itb) continue;

  job.ITBFile = itb;
  job.itbFile = itb;

  job.ITBMatchStatus = "RECOVERED_DRIVE_ITB";
  job.itbMatchStatus = "RECOVERED_DRIVE_ITB";

  if (String(job.status || "").toUpperCase() === "NO_ITB") {
    job.status = "RECOVERED_DRIVE_ITB";
  }

  job.MissingITBReason = "";
  job.missingITBReason = "";

  job.DescriptionNeedsReview = true;
  job.descriptionNeedsReview = true;

  patched += 1;
}

fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

console.log("Recovered ITBs patched:", patched);
console.log("Backup:", backupPath);
