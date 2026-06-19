const fs = require("fs");

const jsonPath = "./data/COA_Fetcher_2026.json";
const backupPath = "./data/COA_Fetcher_2026.before_final_missing_eo_itb_patch.json";

fs.copyFileSync(jsonPath, backupPath);

const jobs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const patches = {
  EO29204: {
    ITBFile: "EO29204_041924015633 2970, WEST 27 STREET.pdf",
    desc: `AT (APT ENTRANCE DOOR APT 511).

MAKE ALL NECESSARY REPAIRS TO MAKE DOOR SELF CLOSING AND LATCHING
ALSO REPLACE MORTISE LOCK AT (APT ENTRANCE DOOR APT 511).

TOTAL DOORS = (1)

ALL WORK MUST BE DONE AS PER HPD SPECIFICATIONS.`
  },
  EO17794: {
    ITBFile: "EO17794_010424093220 141, MAC DONOUGH STREET.pdf",
    desc: `NYC HPD EMERGENCY OPERATIONS DIVISION – “ESSENTIAL SERVICE WORK”

AT APARTMENT 3A, 3RD STORY

TOTAL WINDOWS (3)

REPLACE WITH NEW THE BROKEN/DEFECTIVE GLASS PANE(S) AT UPPER AND LOWER SASH WINDOW(S)
AT:
(1) APT BATHROOM, UPPER AND LOWER
(2) 1ST ROOM FROM NORTH, UPPER AND LOWER
(3) 3RD ROOM FROM NORTH, UPPER AND LOWER

RESTORE TO FUNCTIONAL MANNER
REMOVE ALL WORK RELATED DEBRIS.`
  }
};

let patched = 0;

for (const job of jobs) {
  const omo = job.OMO || job.id;
  const patch = patches[omo];

  if (!patch) continue;

  job.ITBFile = patch.ITBFile;
  job.itbFile = patch.ITBFile;

  job.ITBMatchStatus = "RECOVERED_DRIVE_ITB";
  job.itbMatchStatus = "RECOVERED_DRIVE_ITB";

  job.MissingITBReason = "";
  job.missingITBReason = "";

  job.JobDescription = patch.desc;
  job.description = patch.desc;
  job.Job_Description = patch.desc;

  job.DescriptionSource = "GOOGLE_DRIVE_ITB";
  job.descriptionSource = "GOOGLE_DRIVE_ITB";

  patched += 1;
}

fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), "utf8");

console.log("Patched recovered Google Drive ITBs:", patched);
console.log("Backup:", backupPath);
