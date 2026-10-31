// Which rejected jobs the GitHub fetcher reads the sent paperwork of (31 Oct): newest rejection first, not the ones
// already on file, and a job with nothing found only again after 14 days.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const py = `
import datetime, json, sys
sys.path.insert(0, "scripts")
from fetch_sent_paperwork_dates import to_read
req = {"A1": {"rejectedAt": "2026-10-01"}, "B2": {"rejectedAt": "2026-10-27"}, "C3": {"rejectedAt": "2026-10-20"},
       "D4": {"rejectedAt": "2026-10-25"}, "E5": {"rejectedAt": "2026-10-26"}, "F6": {}}
known = {"C3": {"workStart": "2026-09-01"}}
checked = {"D4": "2026-10-25", "E5": "2026-10-10"}
today = datetime.date(2026, 10, 31)
print(json.dumps([to_read(req, known, checked, False, today), to_read(req, known, checked, True, today)]))
`;
const [newOnly, everything] = JSON.parse(execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", py], { encoding: "utf8" }));
assert.deepEqual(newOnly, ["B2", "E5", "A1"], "newest first; C3 on file; D4 looked for 6 days ago; E5 17 days ago again");
assert.deepEqual(everything, ["B2", "E5", "D4", "C3", "A1"], "--all re-reads every rejected job");
console.log("PASS sent paperwork dates: new rejections newest first, nothing-found jobs again after 14 days, --all re-reads");
