// 🧪 Lead abatement bids (owner, 8 Nov: "ER09991 is a lead abatement bid, it came in the email on Nov 6, can we learn
// to fill this"): an invitation HPD procurement emailed (not OMOBid@) is in the bids with who sent it; the bid screen
// shows "🧪 Lead abatement · HPD's estimate $6,832" room by room, the mold note, the Mold and Lead certifications and
// HPD's scope sheet; "Use $6,832" fills the price. Data: the invitation as the fetcher reads it; nothing is faxed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const lead = {
  omo: "ER09991", address: "306 EAST 116 STREET APT. 2A", borough: "MN", bidDue: tomorrow, bidDueTime: "11:00 AM", workStart: tomorrow, workCompletion: tomorrow,
  itbFile: "ER09991 Invitation To Bid.pdf", description: "AS PER HPD'S LEAD ABATEMENT REQUIREMENT CONTRACTS AND ATTACHED SCOPE OF WORK THOROUGHLY REMOVE ALL LEAD VIOLATIONS", pages: 3, fields: {},
  lat: 40.7966, lng: -73.9393, receivedAt: Date.now() - 86400000, kind: "lead", emailedBy: "Carvajal Dimas, Juan (HPD)", certs: "Mold and Lead", scopeFile: "ER09991.pdf",
  lead: { estimate: 6832, mold: "Mold abatement from west wall prior to enclosure.", rooms: [
    { room: "BATHROOM", cost: 975, items: [{ component: "SOUTH WALL", method: "Enclosure", size: "50 SQFT", cost: 800 }, { component: "BASEBOARD AT SOUTH WALL", method: "Replacement", size: "5 FT", cost: 175 }] },
    { room: "3rd ROOM FROM NORTH", cost: 5857, items: [{ component: "WEST WALL", method: "Enclosure", size: "82 SQFT", cost: 1312 }] },
  ] },
};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [lead, ...fetched.bids.filter((b) => b.omo !== "ER09991").slice(0, 3)] } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let faxes = 0;
  await c.route(/\/api\/drive\/fax-bid/, (r) => { faxes++; return r.fulfill({ json: { sent: true } }); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1&omo=ER09991`, { waitUntil: "load", timeout: 180000 });
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor({ timeout: 60000 });
  assert.equal((await sheet.locator("header strong").innerText()).trim(), "ER09991");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-emailed"]').innerText(), /Emailed by Carvajal Dimas, Juan \(HPD\) · lead abatement/);
  const box = sheet.locator('[data-hpd-smoke="fc-bid-lead"]');
  await box.waitFor();
  const t = await box.innerText();
  assert.match(t, /🧪 Lead abatement · HPD's estimate \$6,832/);
  assert.match(t, /BATHROOM: \$975 \(2 items\)/);
  assert.match(t, /3rd ROOM FROM NORTH: \$5,857/);
  assert.match(t, /Mold work too: Mold abatement from west wall prior to enclosure\./);
  assert.match(t, /HPD asks for valid Mold and Lead certifications\./);
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-lead-scope"]').getAttribute("href"), /\/api\/private\/itb\/ER09991\.pdf$/);
  await box.locator('[data-hpd-smoke="fc-bid-lead-use"]').click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-bid-price"]')?.value?.replace(/[^0-9]/g, "") === "6832", null, { timeout: 5000 });
  assert.equal(faxes, 0, "nothing faxed");
  await box.screenshot({ path: `${process.env.TEMP || "/tmp"}/lead-box.png` });
  assert.deepEqual(errors, []);
  console.log("PASS lead bid: emailed invitation shown with who sent it; HPD's estimate $6,832 room by room, mold note, certifications, scope sheet; Use $6,832 fills the price; nothing faxed");
} finally {
  await browser.close();
}
