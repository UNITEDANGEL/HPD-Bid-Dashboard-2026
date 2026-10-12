// End-of-day report: builds today's report from the job data plus what the phones saved (the live
// status server, read only) and emails it to the account that authorized it.
//   node scripts/daily-report.mjs            print the report
//   node scripts/daily-report.mjs --send     email it (needs DAILY_REPORT_GOOGLE_TOKEN, see
//                                            scripts/authorize-daily-report.mjs)
// The token holds the Google client, a refresh token limited to sending mail, and the address.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const STATUS_SERVER = "https://hpd-status-worker.uac525.workers.dev/overrides";

// lib/*.ts -> temporary ES modules (the app's own code, so the numbers match the phone).
export async function loadLib(entry) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-report-"));
  const done = new Set();
  const compile = (name) => {
    if (done.has(name)) return;
    done.add(name);
    let code = ts.transpileModule(fs.readFileSync(path.join(root, "lib", `${name}.ts`), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    code = code.replace(/from\s+["']\.\/([\w-]+)["']/g, (_, dep) => { compile(dep); return `from "./${dep}.mjs"`; });
    fs.writeFileSync(path.join(dir, `${name}.mjs`), code);
  };
  compile(entry);
  return import(pathToFileURL(path.join(dir, `${entry}.mjs`)).href);
}

// Open invitations to bid from the nightly fetcher (empty if there are none yet).
export function loadBids() {
  try { return JSON.parse(fs.readFileSync(path.join(root, "data", "upcoming_bids.json"), "utf8")).bids || []; } catch { return []; }
}

// The job data plus what the phones saved (status server). If the status server can't answer, the
// report still goes out from the job data, with a note (bidRecords and the visits may be missing).
export async function loadJobs(fetcher = fetch, extra = {}) {
  const jobs = JSON.parse(fs.readFileSync(path.join(root, "data", "COA_Fetcher_2026.json"), "utf8"));
  let overrides = {};
  try {
    // A named client: Cloudflare turns away Node's default fetch with a 503.
    const response = await fetcher(STATUS_SERVER, { headers: { "User-Agent": "HPD-daily-report/1.0 (+https://hpd-bid-dashboard-2026.pages.dev)", Accept: "application/json" } });
    if (!response.ok) throw new Error(`Status server answered ${response.status}`);
    overrides = (await response.json()).overrides || {};
  } catch (error) {
    extra.note = `Phone updates weren't available (${error.message}); this report is from the job data only.`;
  }
  extra.bidRecords = Object.entries(overrides).filter(([key]) => key.startsWith("BID-")).map(([, value]) => value);
  // Same merge as the phone: saved job steps on top of the job data.
  return jobs.map((job) => ({ ...job, ...(overrides[job.OMO] || {}) }));
}

function mime({ to, subject, text, html }) {
  const boundary = `hpd-${Date.now().toString(36)}`;
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(html),
    `--${boundary}--`, "",
  ].join("\r\n");
}

export async function sendReport(report, tokenJson) {
  const { google } = await import("googleapis");
  const token = JSON.parse(tokenJson);
  if (!token.client_id || !token.client_secret || !token.refresh_token || !token.email) throw new Error("DAILY_REPORT_GOOGLE_TOKEN is missing client_id, client_secret, refresh_token or email.");
  const auth = new google.auth.OAuth2(token.client_id, token.client_secret);
  auth.setCredentials({ refresh_token: token.refresh_token });
  const gmail = google.gmail({ version: "v1", auth });
  const raw = Buffer.from(mime({ to: token.email, ...report }), "utf8").toString("base64url");
  const sent = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { to: token.email, id: sent.data.id };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { buildDailyReport } = await loadLib("daily-report");
  const extra = {};
  const report = buildDailyReport(await loadJobs(fetch, extra), new Date(), undefined, loadBids(), extra);
  console.log(`${report.subject}\n\n${report.text}\n`);
  if (process.argv.includes("--send")) {
    const token = process.env.DAILY_REPORT_GOOGLE_TOKEN;
    if (!token) {
      console.log("::warning::Daily report not emailed: DAILY_REPORT_GOOGLE_TOKEN isn't set yet. Run scripts/authorize-daily-report.mjs once on the PC.");
    } else {
      const sent = await sendReport(report, token);
      console.log(`Emailed to ${sent.to} (Gmail message ${sent.id}).`);
    }
  }
}
