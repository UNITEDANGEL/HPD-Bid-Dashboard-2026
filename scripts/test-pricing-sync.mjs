// Your rates, minimums and costs on the phone and the computer (owner, 31 Oct "do 5"): the newest change of each item
// wins (a removal too), the app's starting costs aren't sent, and the server keeps them in one private Drive file (only
// numbers and short names). Google Drive is faked.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
import { handleDrivePackages, pricingFields } from "../server/drive-packages.mjs";

const { localBook, mergeBooks } = await loadLib("pricing-sync");
const T1 = "2026-10-30T12:00:00.000Z", T2 = "2026-10-31T12:00:00.000Z";

// The phone: door closer $95 (changed yesterday), a floor minimum removed today, one cost of its own.
const phone = localBook(
  { rates: { "door-closer": 95, "lock-cylinder": 40 }, floors: {}, costs: { "door-work": { material: 30, labor: 60 } } },
  { "rates:door-closer": T1, "floors:painting": T2, "costs:door-work": T2 },
);
assert.deepEqual(phone.rates["door-closer"], { v: 95, at: T1 });
assert.deepEqual(phone.rates["lock-cylinder"], { v: 40, at: "" }, "set before syncing existed: no date, still sent");
assert.deepEqual(phone.floors.painting, { v: 0, at: T2 }, "the removal travels");
assert.deepEqual(phone.costs["door-work"], { v: 30, l: 60, at: T2 });
// The computer (in Drive): door closer $110 changed today, painting minimum $900 from yesterday, a window rate.
const drive = { rates: { "door-closer": { v: 110, at: T2 }, window: { v: 250, at: T1 } }, floors: { painting: { v: 900, at: T1 } }, costs: {} };
const merged = mergeBooks(phone, drive);
assert.equal(merged.rates["door-closer"].v, 110, "the computer's newer change wins");
assert.equal(merged.rates.window.v, 250, "only on the computer: kept");
assert.equal(merged.rates["lock-cylinder"].v, 40, "only on the phone: kept");
assert.equal(merged.floors.painting.v, 0, "removed on the phone after the computer set it: removed");
assert.deepEqual(merged.costs["door-work"], { v: 30, l: 60, at: T2 });
// The other way round: the phone's newer change wins over Drive.
assert.equal(mergeBooks({ rates: { window: { v: 300, at: T2 } }, floors: {}, costs: {} }, drive).rates.window.v, 300);

// Server: only numbers and short names are kept.
const clean = pricingFields({ rates: { ok: { v: "12.345", at: T2 }, bad: { v: -1, at: T2 }, ["x".repeat(81)]: { v: 1, at: T2 }, odd: { v: 5, at: "yesterday" } }, costs: { c: { v: 3, l: 4, at: T2, note: "<b>" } }, floors: null });
assert.deepEqual(clean, { rates: { ok: { v: 12.35, at: T2 }, odd: { v: 5, at: "" } }, floors: {}, costs: { c: { v: 3, l: 4, at: T2 } } });

// Server: load (no file yet = empty), save (creates the private file), load again.
let file = null, created = null;
const drive2 = async (url, options = {}) => {
  if (url.includes("/upload/drive/v3/files")) {
    const parts = String(options.body).split(/--hpd_[^\r\n]+/);
    const meta = JSON.parse(parts[1].split("\r\n\r\n")[1]);
    if (options.method === "POST") created = meta;
    file = JSON.parse(parts[2].split("\r\n\r\n")[1]);
    return Response.json({ id: "file123456789" });
  }
  if (url.includes("alt=media")) return new Response(JSON.stringify(file));
  return Response.json({ files: file ? [{ id: "file123456789" }] : [] });
};
const call = async (body) => (await handleDrivePackages(new Request("https://app.example.test/api/drive/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "pricing", { Authorization: "Bearer t" }, drive2, {}, "owner@example.test")).json();
assert.deepEqual(await call({ op: "load" }), { rates: {}, floors: {}, costs: {} });
assert.deepEqual(await call({ op: "save", ...merged }), { saved: true });
assert.equal(created.name, "HPD my rates (private).json");
assert.equal(created.appProperties.hpdKind, "hpd-pricing-v1");
const back = await call({ op: "load" });
assert.equal(back.rates["door-closer"].v, 110);
assert.equal(back.costs["door-work"].l, 60);
console.log("PASS rates / minimums / costs on every device: newest change per item wins (removals too), only on one side kept, server keeps numbers only in one private Drive file");
