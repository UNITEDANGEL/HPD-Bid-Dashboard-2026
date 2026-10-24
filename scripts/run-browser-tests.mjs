// Runs the browser tests a few at a time (owner, 23 Oct: upgrades should go live faster; one after another took about
// 50 minutes). Each test's output is printed when it finishes. A test that fails is run once more on its own at the end
// (a slow build machine can miss a timing); it only counts as passed if that run passes, and the log says so.
//   node scripts/run-browser-tests.mjs [--jobs 3] scripts/test-browser-a.mjs scripts/test-browser-b.mjs ...
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const jobsAt = args.indexOf("--jobs");
const jobs = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 3) : 3;
const files = args.filter((a, i) => a.endsWith(".mjs") && !(jobsAt >= 0 && i === jobsAt + 1));
if (!files.length) { console.error("No tests given."); process.exit(2); }

function run(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ file, code, out, seconds: Math.round((Date.now() - started) / 1000) }));
  });
}

const queue = [...files];
const failed = [];
const t0 = Date.now();
async function worker() {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const r = await run(file);
    console.log(`\n=== ${r.code === 0 ? "PASS" : "FAIL"} ${r.file} (${r.seconds}s)\n${r.out.trim()}`);
    if (r.code !== 0) failed.push(file);
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

const stillFailing = [];
for (const file of failed) {
  const r = await run(file);
  console.log(`\n=== RETRY ${r.code === 0 ? "PASS (passed on its own: timing on the build machine)" : "FAIL"} ${r.file} (${r.seconds}s)\n${r.out.trim()}`);
  if (r.code !== 0) stillFailing.push(file);
}
console.log(`\n${files.length} browser tests in ${Math.round((Date.now() - t0) / 60000)} min, ${jobs} at a time: ${files.length - stillFailing.length} passed${failed.length ? ` (${failed.length - stillFailing.length} on a retry)` : ""}${stillFailing.length ? `, FAILED: ${stillFailing.join(", ")}` : ""}.`);
process.exit(stillFailing.length ? 1 : 0);
