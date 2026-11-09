// 🛡️ One flow never breaks another (owner, 9 Nov: "I don't want one flow to upset another flow ... everything was
// working for the job cards, for the bids, and then it stops working because of a conflict with something else. That
// should not ever happen."). Before every push: every bids test and every job-card test runs together, on the build
// in out/ (python server on 3920). Any failure: no push.
//   node scripts/flow-tests.mjs            -> bids + job cards
//   node scripts/flow-tests.mjs bids       -> only the bids flow
//   node scripts/flow-tests.mjs jobs       -> only the job-card flow
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "scripts");
const FLOWS = {
  bids: /^test-browser-(bid|bids|bidbar|calculator|checklist|lead-bid|my-price|price-check|no-bid|batch-fax|faxtrack|package-send|page-zoom|notice-view|building-facts)[\w-]*\.mjs$/,
  jobs: /^test-browser-(job|jobs|next-stop|photo|notice-walk|papers-map|claude-now|agent-chat)[\w-]*\.mjs$/,
};
const units = ["test-lead-scope.mjs", "test-job-summary.mjs", "test-bid-calc.mjs"];
const want = process.argv[2] ? [process.argv[2]] : Object.keys(FLOWS);
const files = fs.readdirSync(dir).filter((f) => want.some((w) => FLOWS[w]?.test(f))).sort();
console.log(`Flows: ${want.join(" + ")} · ${files.length} browser tests`);
for (const u of units) {
  const r = spawnSync(process.execPath, [path.join(dir, u)], { stdio: "inherit" });
  if (r.status) { console.error(`FLOW CHECK FAILED: ${u}`); process.exit(1); }
}
const r = spawnSync(process.execPath, [path.join(dir, "run-browser-tests.mjs"), "--jobs", process.env.JOBS || "5", ...files.map((f) => path.join(dir, f))], { stdio: "inherit", env: { ...process.env, BASE_URL: process.env.BASE_URL || "http://localhost:3920" } });
if (r.status) { console.error("FLOW CHECK FAILED: fix it before pushing."); process.exit(1); }
console.log(`FLOW CHECK OK: ${want.join(" + ")} (${files.length} browser tests) all pass.`);
