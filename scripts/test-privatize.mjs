// Tenant names / phones off the public files: blanked fields, masked "TENANT ... phone" text, encrypted bundle.
import assert from "node:assert/strict";
import crypto from "node:crypto";
process.env.HPD_PRIVATE_DATA_KEY ||= crypto.randomBytes(32).toString("base64");
const { splitRecord, maskText, encrypt, decrypt, MASK, PRIVATE_FIELDS } = await import("./privatize_public_data.mjs");

const job = { OMO: "EQ1", BuildingAddress: "1 TEST ST", TenantName: "JANE TEST", TenantPhone: "(347) 000-0000", ItbTenantApartment: "(718)000-0000 FLOOR 2", ItbTenantAccessType: "common_area",
  JobDescription: "REPLACE LOCK AT ENTRANCE DOOR. TENANT:- (TEST, JANE 718-000-0000). CONTRACTOR MUST CONTACT HPD @ 212 863-5262" };
const { pub, priv } = splitRecord(job);
assert.equal(pub.TenantName, ""); assert.equal(pub.TenantPhone, ""); assert.equal(pub.ItbTenantApartment, "");
assert.equal(pub.ItbTenantAccessType, "common_area", "access type is not personal: stays");
assert.ok(pub.JobDescription.includes(MASK) && !pub.JobDescription.includes("718-000-0000"), pub.JobDescription);
assert.ok(pub.JobDescription.includes("212 863-5262"), "HPD's own phone numbers stay");
assert.equal(priv.TenantName, "JANE TEST"); assert.equal(priv.JobDescription, job.JobDescription);
assert.equal(maskText("TENANT CONTACT: 347 526 1673"), `TENANT CONTACT: ${MASK}`);
assert.equal(maskText("NO TENANT HERE 212 863 6046"), "NO TENANT HERE 212 863 6046".replace(/.*/, (s) => s), "a phone with no tenant label right before it is kept");
assert.equal(maskText("REPLACE GLASS"), "REPLACE GLASS");
const { PHONE_MASK } = await import("./privatize_public_data.mjs");
assert.ok(!/6460001234/.test(maskText("M WINDOW. TENANT: AVENIA PHONE # 6460001234")), "unseparated phone masked");
assert.equal(maskText("SUPER MARK TEST (212) 555-0100"), `SUPER MARK TEST ${PHONE_MASK}`, "any non-HPD phone masked");
assert.equal(maskText("CALL HPD 212 863 6046 OR (212) 863-5262"), "CALL HPD 212 863 6046 OR (212) 863-5262", "HPD office lines stay");
assert.equal(maskText("VIOLATION 16351128 BIN 1059533"), "VIOLATION 16351128 BIN 1059533", "violation / building numbers untouched");
assert.ok(PRIVATE_FIELDS.has("itbTenantPhone"));
// Encryption: same format as the server (12-byte IV + ciphertext + 16-byte tag).
const box = encrypt(Buffer.from("hello tenant"));
assert.equal(decrypt(box).toString(), "hello tenant");
assert.ok(!box.toString("latin1").includes("hello"));
const { decryptPrivate } = await import("../server/private-data.mjs");
assert.equal(new TextDecoder().decode(await decryptPrivate(box, process.env.HPD_PRIVATE_DATA_KEY)), "hello tenant", "the server opens what this script writes");
console.log("PASS privatize: tenant fields blanked, TENANT text masked (HPD numbers kept), originals in the bundle, encryption matches the server");
