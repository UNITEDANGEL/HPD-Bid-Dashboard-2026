const fs = require("fs");
const statusPath = "data/fetcher_latest_status.json";
if (!fs.existsSync(statusPath)) {
  console.error("FETCHER HEALTH FAILED: Missing data/fetcher_latest_status.json");
  process.exit(1);
}
const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const summary = status.summary || {};
const badDescriptions = Number(summary.badDescriptions || 0);
const missingDescriptions = Number(summary.missingDescriptions || 0);
const missingItbJobs = Number(summary.missingItbJobs || 0);
const notMapped2026 = Number(summary.notMapped2026 || 0);
const addedNewOmos = Number(summary.addedNewOmos || 0);
const fetchedFinalJobRows = Number(summary.fetchedFinalJobRows || 0);
console.log("FETCHER HEALTH SUMMARY");
console.log(JSON.stringify({
  ok: status.ok,
  state: status.state,
  fetchedFinalJobRows,
  addedNewOmos,
  badDescriptions,
  missingDescriptions,
  missingItbJobs,
  notMapped2026
}, null, 2));
const criticalIssues = [];
if (!status.ok) criticalIssues.push("Fetcher status ok=false");
if (status.state !== "complete") criticalIssues.push(`Fetcher state is ${status.state}`);
if (badDescriptions > 0) criticalIssues.push(`badDescriptions=${badDescriptions}`);
if (missingDescriptions > 0) criticalIssues.push(`missingDescriptions=${missingDescriptions}`);
if (missingItbJobs > 0) criticalIssues.push(`missingItbJobs=${missingItbJobs}`);
if (criticalIssues.length) {
  console.error("FETCHER HEALTH FAILED:");
  for (const issue of criticalIssues) console.error("- " + issue);
  process.exit(1);
}
if (notMapped2026 > 0) {
  console.warn(`FETCHER HEALTH WARNING: notMapped2026=${notMapped2026}. These jobs need geocoding review.`);
}
console.log("FETCHER HEALTH PASSED");
