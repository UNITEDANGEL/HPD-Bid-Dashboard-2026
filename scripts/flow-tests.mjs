// 🛡️ One flow never breaks another (owner, 9 Nov: "I don't want one flow to upset another flow ... everything was
// working for the job cards, for the bids, and then it stops working because of a conflict with something else. That
// should not ever happen."). Before every push: every bids test and every job-card test runs together, on the build
// in out/ (python server on 3920). Any failure: no push.
//   node scripts/flow-tests.mjs            -> bids + job cards + notices + paperwork
//   node scripts/flow-tests.mjs notices    -> only vendor tracking
//   node scripts/flow-tests.mjs paperwork  -> only affidavits / invoices / corrections
//   node scripts/flow-tests.mjs bids       -> only the bids flow
//   node scripts/flow-tests.mjs jobs       -> only the job-card flow
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "scripts");
const FLOWS = {
  bids: /^test-browser-(bid|bids|bidbar|calculator|checklist|lead-bid|my-price|price-check|no-bid|batch-fax|faxtrack|package-send|page-zoom|notice-view|building-facts)[\w-]*\.mjs$/,
  jobs: /^test-browser-(job|jobs|next-stop|photo|notice-walk|papers-map|claude-now|agent-chat|call-ask|tenant-contact)[\w-]*\.mjs$/,
  // Vendor tracking (owner, 9 Nov: "vendor tracking is very important ... the overdue notices, we need to fix them"):
  // the board, the replies, the job-card update, the priority map.
  notices: /^test-browser-(notice|nudge|email|priority-map|priorities|updated-pop|vt-send|scan|sent-pdf|appt-mail)[\w-]*\.mjs$/,
  // Paperwork (owner, 9 Nov: "a better flow to generate the affidavit and invoice ... test all, no future errors"):
  // one-tap packages, corrections, auto-fix, dates.
  paperwork: /^test-browser-(paperwork|affidavit|correction|autofix|fix-queue)[\w-]*\.mjs$/,
};
const units = ["test-lead-scope.mjs", "test-job-summary.mjs", "test-bid-calc.mjs", "test-notice-fix.mjs", "test-email-people.mjs", "test-notice-convo.mjs", "test-affidavit-line2.mjs", "test-auto-fix.mjs", "test-old-job-dates.mjs", "test-hpd-marks.mjs", "test-tread-price.mjs", "test-vt-asks.mjs", "test-sign-jitter.mjs"];
const want = process.argv[2] ? [process.argv[2]] : Object.keys(FLOWS);
const files = fs.readdirSync(dir).filter((f) => want.some((w) => FLOWS[w]?.test(f))).sort();
console.log(`Flows: ${want.join(" + ")} · ${files.length} browser tests`);
// The deploy's own checks (9 Nov: a push passed here and the live deploy still stopped on one of these): every
// "node scripts/test-*" and "npm run test:*" line in the deploy workflow runs here too, before the browser tests.
const wf = fs.readFileSync(path.join(process.cwd(), ".github/workflows/deploy-cloudflare-pages.yml"), "utf8");
const deployCmds = [...new Set([...wf.matchAll(/^\s*(?:run:\s*)?((?:node scripts\/test-[\w.-]+\.(?:c?js|mjs))|(?:npm run (?:lint|test:[\w-]+)))\s*$/gm)].map((m) => m[1]))];
if (!process.argv[2] || process.argv[2] === "deploy") {
  console.log(`Deploy checks: ${deployCmds.length}`);
  for (const cmd of deployCmds) {
    const r = spawnSync(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (r.status) { console.error(r.stdout.slice(-2000), r.stderr.slice(-2000)); console.error(`FLOW CHECK FAILED (deploy check): ${cmd}`); process.exit(1); }
  }
  if (process.argv[2] === "deploy") { console.log("DEPLOY CHECKS OK"); process.exit(0); }
}
for (const u of units) {
  const r = spawnSync(process.execPath, [path.join(dir, u)], { stdio: "inherit" });
  if (r.status) { console.error(`FLOW CHECK FAILED: ${u}`); process.exit(1); }
}
const r = spawnSync(process.execPath, [path.join(dir, "run-browser-tests.mjs"), "--jobs", process.env.JOBS || "5", ...files.map((f) => path.join(dir, f))], { stdio: "inherit", env: { ...process.env, BASE_URL: process.env.BASE_URL || "http://localhost:3920" } });
if (r.status) { console.error("FLOW CHECK FAILED: fix it before pushing."); process.exit(1); }
console.log(`FLOW CHECK OK: ${want.join(" + ")} (${files.length} browser tests) all pass.`);
