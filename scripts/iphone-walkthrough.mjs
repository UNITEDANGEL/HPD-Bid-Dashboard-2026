// One-off check (not part of CI): opens the app the way an iPhone would (iPhone 14 viewport,
// Safari user agent, touch) and taps Dashboard -> Paperwork -> Dashboard button, saving a
// screenshot at each step. Needs the app running (npm run dev). BASE_URL defaults to localhost.
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const outDir = path.resolve("output/iphone-walkthrough");
fs.mkdirSync(outDir, { recursive: true });

const iphone = { ...devices["iPhone 14"] };
delete iphone.defaultBrowserType;
const browser = await chromium.launch();
const page = await (await browser.newContext(iphone)).newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`STEP ${name}: ${page.url()}`);
};

await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 300000 });
await page.waitForTimeout(3000);
await shot("1-dashboard");

await page.goto(`${baseUrl}/paperwork?job=ER05395&outcome=no_access`, { waitUntil: "load", timeout: 300000 });
await page.locator('[data-hpd-smoke="paperwork-dashboard-link"]').waitFor({ timeout: 120000 });
await page.waitForTimeout(2000);
await shot("2-paperwork");

await page.locator('[data-hpd-smoke="paperwork-dashboard-link"]').tap();
await page.waitForURL((url) => url.pathname === "/", { timeout: 300000 });
await page.waitForTimeout(3000);
await shot("3-after-dashboard-tap");

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(`horizontal overflow on dashboard: ${overflow}px`);
if (errors.length) console.error("page errors:", errors);
await browser.close();
