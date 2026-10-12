// One-time sign-in for the end-of-day report email. Run on the PC:  node scripts/authorize-daily-report.mjs
// Opens Google's consent page for "send email" (and your address, so the report knows where to go),
// then stores the login as the GitHub secret DAILY_REPORT_GOOGLE_TOKEN (never printed or saved in the
// repo) and emails today's report as a check. Uses the app's desktop sign-in client (credentials.json).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { google } from "googleapis";
import { loadBids, loadJobs, loadLib, sendReport } from "./daily-report.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email", "openid"];
const client = Object.values(JSON.parse(fs.readFileSync(path.join(root, "credentials.json"), "utf8")))[0];

const server = http.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const redirect = `http://127.0.0.1:${server.address().port}`;
const auth = new google.auth.OAuth2(client.client_id, client.client_secret, redirect);
const url = auth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

console.log("Opening Google sign-in in your browser. If it doesn't open, paste this link into the browser:\n");
console.log(url, "\n");
if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url.replace(/&/g, "^&")], { detached: true, stdio: "ignore" });
else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" });

const code = await new Promise((resolve, reject) => {
  server.on("request", (req, res) => {
    const params = new URL(req.url, redirect).searchParams;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (params.get("code")) {
      res.end("<h2>Done. The end-of-day report can email you now.</h2><p>You can close this tab.</p>");
      resolve(params.get("code"));
    } else {
      res.end(`<h2>Sign-in was not completed (${params.get("error") || "no code"}).</h2>`);
      reject(new Error(params.get("error") || "no authorization code"));
    }
  });
});
server.close();

const { tokens } = await auth.getToken(code);
if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token. Remove the app's access at myaccount.google.com/permissions and run this again.");
auth.setCredentials(tokens);
const email = (await google.oauth2({ version: "v2", auth }).userinfo.get()).data.email;
if (!email) throw new Error("Google didn't share the account's email address.");

const secret = JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: tokens.refresh_token, email });
execFileSync("gh", ["secret", "set", "DAILY_REPORT_GOOGLE_TOKEN"], { cwd: root, input: secret, stdio: ["pipe", "inherit", "inherit"] });
console.log(`Saved the GitHub secret DAILY_REPORT_GOOGLE_TOKEN for ${email}.`);

const { buildDailyReport } = await loadLib("daily-report");
const sent = await sendReport(buildDailyReport(await loadJobs(), new Date(), undefined, loadBids()), secret);
console.log(`Sent today's report to ${sent.to} as a check. From now on it arrives every evening.`);
