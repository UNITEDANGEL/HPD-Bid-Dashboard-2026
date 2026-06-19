const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_eq23165_manual_description.json";

fs.copyFileSync(jsonPath, backupPath);

const jobs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const desc = `REPLACE LATCH AT 5TH STY COMPACTOR DOOR

AT 5TH STY PUBLIC HALL COMPACTOR CLOSET..REPLACE THE DEFECTIVE LATCH SET WITH NEW PASSAGE LATCH SET..ENSURE DOOR SELF CLOSE AND LATCH

TOTAL DOOR = 1`;

let patched = 0;

for (const job of jobs) {
  const omo = job.OMO || job.id;
  if (omo === "EQ23165") {
    job.JobDescription = desc;
    job.description = desc;
    job.Job_Description = desc;
    job.DescriptionSource = "MANUAL_OCR_PAGE_3";
    job.descriptionSource = "MANUAL_OCR_PAGE_3";
    job.DescriptionNeedsReview = false;
    job.descriptionNeedsReview = false;
    patched += 1;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

console.log("Patched EQ23165:", patched);
console.log("Backup:", backupPath);
