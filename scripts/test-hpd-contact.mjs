// 📞 Call the HPD person in one tap: last HPD writer + phone from the signature.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { lastHpdContact, phoneIn, prettyPhone } = await loadLib("hpd-contact");
assert.equal(phoneIn("Thanks, Joy-Ann Lewis\nTel: (212) 863-5555 ext 2"), "2128635555");
assert.equal(phoneIn("call 718-555-0100"), "7185550100");
assert.equal(phoneIn("no number here, OMO 12345678"), "");
assert.equal(prettyPhone("2128635555"), "(212) 863-5555");
const t = [
  { omos: ["ER01720"], messages: [
    { at: "2026-11-05T10:00:00Z", from: "Joy-Ann Lewis", hpd: true, mine: false, text: "Tel 212-863-5555" },
    { at: "2026-11-05T12:00:00Z", from: "Me", hpd: false, mine: true, text: "ok" },
    { at: "2026-11-06T10:00:00Z", from: "Joy-Ann Lewis", hpd: true, mine: false, text: "Please resend" }] },
  { omos: ["ER09999"], messages: [{ at: "2026-11-06T10:00:00Z", from: "Deoranie Gafur", hpd: true, mine: false, text: "see attached" }] },
];
const c = lastHpdContact(t, "ER01720");
assert.equal(c.name, "Joy-Ann Lewis"); assert.equal(c.phone, "2128635555", "phone from an earlier email of the same person");
assert.equal(lastHpdContact(t, "ER09999").phone, "", "no number: name only");
assert.equal(lastHpdContact(t, "NOPE"), null);
console.log("PASS call the HPD person: last writer and phone from the signature");
