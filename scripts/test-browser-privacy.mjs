// Tenant names / phones stay off the public site: the public job file and invitation folder don't have them;
// signed in (the private route answers), the job card shows the tenant and Call; not signed in, it says it's
// private and HPD's invitation pages ask you to sign in. Prints no tenant details.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const OMO = process.env.PRIVACY_OMO || "EQ14157";
const jobs = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
const PHONE = /(?<!\d)\(?(212|332|347|516|631|646|718|845|914|917|929)\)?[\s.-]{0,2}\d{3}[\s.-]?\d{4}(?!\d)/;
const leaks = jobs.filter((j) => ["TenantName", "TenantPhone", "ItbTenantName", "ItbTenantPhone", "ItbTenantApartment"].some((k) => j[k]) || Object.entries(j).some(([k, v]) => !/file/i.test(k) && typeof v === "string" && (v.match(new RegExp(PHONE, "g")) || []).some((p) => !/^\(?212\)?[\s.-]{0,2}863/.test(p))));
assert.equal(leaks.length, 0, `public job file has tenant details on ${leaks.length} jobs`);
const bids = (await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json()).bids;
assert.equal((await fetch(`${baseUrl}/documents/itb/${encodeURIComponent(bids[0].itbFile)}`)).status, 404, "no plain invitation PDF on the site");
assert.equal((await fetch(`${baseUrl}/private/tenants.json.enc`)).status, 200);
assert.ok(!(await (await fetch(`${baseUrl}/private/tenants.json.enc`)).text()).includes("TenantPhone"), "the bundle is encrypted");

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const signedIn of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    if (signedIn) await routePrivate(context);
    else await context.route(/\/api\/private\//, (r) => r.fulfill({ status: 401, json: { error: "Sign in with Google" } }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/map/?view=all&map=1&omo=${OMO}`, { waitUntil: "load", timeout: 180000 });
    const tenant = page.locator('[data-hpd-smoke="jc-tenant"]');
    await tenant.waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const text = (await tenant.innerText()).trim();
    if (signedIn) {
      assert.ok(text && !/Private|Not listed/.test(text), "signed in: tenant name shown");
      assert.equal(await page.locator("#fc-job-card .fc-call-btn").count() > 0, true, "signed in: Call button");
    } else {
      assert.match(text, /Private: sign in with Google/);
      assert.equal(await page.locator("#fc-job-card .fc-call-btn").count(), 0);
      // Invitation pages: ask to sign in.
      await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load" });
      const row = page.locator('[data-hpd-smoke="fc-bids-list"] ol > li > button:first-child').first();
      await row.waitFor({ timeout: 30000 });
      await row.click();
      await page.locator('[data-hpd-smoke="fc-itb-signin"]').waitFor({ timeout: 20000 });
    }
    await context.close();
  }
  console.log(`PASS privacy: public job file and invitations have no tenant details, no plain invitation PDFs, bundle encrypted; signed in shows the tenant + Call on ${OMO}; not signed in says private and the invitation pages ask to sign in`);
} finally {
  await browser.close();
}
