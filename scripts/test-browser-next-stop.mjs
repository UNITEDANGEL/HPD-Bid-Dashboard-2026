// Browser test of "next stop" on the job card at iPhone size: with Today's route planned, finishing a
// job shows the route's next stop with Waze (the test job, off the route, gets stop 1; a real job on
// the route gets the stop after it); with no route, it falls back to the closest open job.
// Saved job steps live on this browser only and the live status server is answered here.
// Needs the app running. BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const finished = { FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: new Date().toISOString(), outcome: "WORK_COMPLETED", note: "" }] };
// Jobs still open at HPD (a job HPD closed is left off the route).
const route = ["EQ18710", "EQ15239", "EQ24465"];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function cardFor(job, { withRoute }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.addInitScript(({ job, withRoute, finished, route, today }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: finished }));
    if (withRoute) localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: route, origin: { point: { lat: 40.6966, lng: -73.8273 }, label: "office" } }));
    else localStorage.removeItem("hpd-today-route-v1");
    sessionStorage.setItem("seeded", "1");
  }, { job, withRoute, finished, route, today });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?omo=${encodeURIComponent(job)}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  const next = page.locator('[data-hpd-smoke="jc-next-job"]');
  const keyDates = await page.locator('[data-hpd-smoke="jc-key-dates"]').innerText().catch(() => "");
  const result = (await next.count())
    ? { source: await next.getAttribute("data-next-source"), text: (await next.innerText()).replace(/\s+/g, " "), open: await next.locator('[data-hpd-smoke="jc-next-open"]').count(), waze: await next.locator('[data-hpd-smoke="jc-next-waze"]').count(), keyDates }
    : { keyDates };
  await context.close();
  assert.deepEqual(errors, [], `${job}: page errors`);
  return result;
}

try {
  const data = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
  const first = data.find((j) => j.OMO === route[0]);

  const onRoute = await cardFor("TEST-0001", { withRoute: true });
  console.log("TEST-0001 with a route:", JSON.stringify(onRoute));
  assert.equal(onRoute?.source, "route");
  assert.match(onRoute.text, new RegExp(`Next on your route · stop 1 of 3 · ${route[0]}`));
  assert.match(onRoute.text, /3 stops left/);
  assert.equal(onRoute.open, 1, "Open next job");
  assert.equal(onRoute.waze, 0, "no second Waze / Google on this card: they are on the next job's card (22 Oct)");

  // The job card's key dates, always visible: award, start and complete-by from the job file.
  const md = (v) => { const [m, d, y] = String(v).split("/"); return `${Number(m)}/${Number(d)}/${y.slice(-2)}`; };
  const keyJob = data.find((j) => j.OMO === route[1]);
  // A real job on the route (stop 2 of 3): its next stop is stop 3.
  const realJob = await cardFor(route[1], { withRoute: true });
  console.log(`${route[1]} with a route:`, JSON.stringify(realJob));
  assert.equal(realJob?.source, "route");
  const flat = realJob.keyDates.replace(/\s+/g, " ").toUpperCase();
  assert.ok(flat.includes(`AWARDED ${md(keyJob.AwardDate)}`) && flat.includes(`START ${md(keyJob.WorkStartDate)}`) && flat.includes(`COMPLETE BY ${md(keyJob.WorkCompletionDate)}`), `key dates: ${flat}`);
  assert.match(realJob.keyDates, /work completed · HPD: still open/, "finished in the app (no overdue count), and HPD hasn't closed it yet");
  assert.match(realJob.text, new RegExp(`Next on your route · stop 3 of 3 · ${route[2]}`));
  assert.match(realJob.text, /2 stops left/, "stop 1 wasn't done here, so it still counts");
  assert.equal(realJob.open, 1);

  const noRoute = await cardFor("TEST-0001", { withRoute: false });
  console.log("TEST-0001 without a route:", JSON.stringify(noRoute));
  assert.equal(noRoute?.source, "closest");
  assert.match(noRoute.text, /Next closest job · E[QR]\d+/);
  assert.equal(noRoute.open, 1);

  console.log("PASS next stop: route's next stop (Open next job, no second Waze / Google) for the test job (stop 1) and a real job (stop 2 -> 3); no route falls back to the closest job");
} finally {
  await browser.close();
}
