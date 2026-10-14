// Bid fax on the server (server/drive-packages.mjs): "fax-bid" only ever emails HPD's bid fax at
// HumbleFax, whatever the browser sends; "fax-status" reads HumbleFax's reply from Gmail. Google is
// faked: nothing is sent.
import assert from "node:assert/strict";
import { handleDrivePackages, faxResult, bidFaxRecipient } from "../server/drive-packages.mjs";

const auth = { Authorization: "Bearer test" };
const boundary = "hpd_testboundary1234567890";
const faxRequest = (headers = {}) => new Request("https://app.example.test/api/drive/fax-bid", {
  method: "POST",
  headers: { "Content-Type": "text/plain", "X-HPD-Boundary": boundary, "X-HPD-Subject": encodeURIComponent("Bid - OMO ER07409"), ...headers },
  body: `--${boundary}\r\nContent-Type: text/plain\r\n\r\nbid\r\n--${boundary}--\r\n`,
});

// Sending: the To line is the bid fax, never anything the browser tries to add.
let sentMessage = "";
const gmailSend = async (url, options) => {
  assert.match(url, /gmail\.googleapis\.com\/upload\/gmail\/v1\/users\/me\/messages\/send/);
  sentMessage = new TextDecoder().decode(options.body);
  return Response.json({ id: "fax-msg-1", labelIds: ["SENT"] });
};
const sent = await (await handleDrivePackages(faxRequest({ "X-HPD-To": "someone@else.example" }), "fax-bid", auth, gmailSend, {}, "owner@example.test")).json();
assert.equal(sent.to, "2128638655@humblefax.com");
assert.equal(sent.messageId, "fax-msg-1");
assert.match(sentMessage, /^From: owner@example\.test\r\nTo: 2128638655@humblefax\.com\r\nSubject: Bid - OMO ER07409\r\n/);
assert.ok(!sentMessage.includes("someone@else"), "the browser can't change who gets the fax");
assert.equal(bidFaxRecipient({ HPD_BID_FAX_TO: "7189891382@humblefax.com" }), "7189891382@humblefax.com");
// Backup lines (printed on HPD's invitations): only these two, always through HumbleFax.
assert.equal(bidFaxRecipient({}, "7804"), "2128637804@humblefax.com");
assert.equal(bidFaxRecipient({}, "7805"), "2128637805@humblefax.com");
assert.equal(bidFaxRecipient({}, "main"), "2128638655@humblefax.com");
assert.throws(() => bidFaxRecipient({}, "attacker@evil.example"), /Unknown fax line/);
const wrong = await handleDrivePackages(faxRequest(), "fax-bid", auth, gmailSend, { HPD_BID_FAX_TO: "attacker@evil.example" }, "owner@example.test");
assert.equal(wrong.status, 500, "only a HumbleFax number is accepted as the bid fax");
const bad = await handleDrivePackages(faxRequest({ "X-HPD-Boundary": "x" }), "fax-bid", auth, gmailSend, {}, "owner@example.test");
assert.equal(bad.status, 400);

// Status: HumbleFax's reply since the send.
const statusRequest = () => new Request("https://app.example.test/api/drive/fax-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentAt: "2026-10-12T20:00:00Z", omo: "ER07409" }) });
const inbox = (messages) => async (url) => {
  if (url.includes("/messages?q=")) {
    assert.match(decodeURIComponent(url), /from:humblefax\.com after:\d+/);
    return Response.json({ messages: messages.map((m, i) => ({ id: `m${i}` })) });
  }
  const m = messages[Number(url.match(/\/m(\d+)\?/)[1])];
  return Response.json({ snippet: m.snippet, internalDate: String(Date.parse(m.at)), payload: { headers: [{ name: "Subject", value: m.subject }] } });
};
const check = async (messages) => (await (await handleDrivePackages(statusRequest(), "fax-status", auth, inbox(messages), {}, "owner@example.test")).json());
assert.equal((await check([])).status, "waiting");
assert.equal((await check([{ subject: "Your fax was sent successfully", snippet: "OMO ER07409 to 2128638655", at: "2026-10-12T20:03:00Z" }])).status, "confirmed");
assert.equal((await check([{ subject: "Fax failed", snippet: "Busy signal. Bid - OMO ER07409", at: "2026-10-12T20:05:00Z" }])).status, "failed");
// Another job's reply doesn't count for this one when this one's reply is there.
assert.equal((await check([
  { subject: "Fax delivered", snippet: "Bid - OMO ER09999", at: "2026-10-12T20:01:00Z" },
  { subject: "Fax could not be delivered", snippet: "Bid - OMO ER07409", at: "2026-10-12T20:06:00Z" },
])).status, "failed");
// Only another job's email since the send: still waiting (it must not confirm this bid).
assert.equal((await check([{ subject: "Your fax was sent successfully", snippet: "Bid - OMO ER09999 - 1 MAIN ST", at: "2026-10-12T20:02:00Z" }])).status, "waiting");
// An email that names no job (e.g. "Successful transmission") still counts.
assert.equal((await check([{ subject: "Successful transmission", snippet: "Your fax to 2128638655 was delivered", at: "2026-10-12T20:04:00Z" }])).status, "confirmed");
const noRead = await handleDrivePackages(statusRequest(), "fax-status", auth, async () => new Response("{}", { status: 403 }), {}, "owner@example.test");
assert.equal(noRead.status, 403);
assert.match((await noRead.json()).error, /read access to email/);
assert.equal(faxResult("Fax transmission complete", ""), "confirmed");
assert.equal(faxResult("Your fax could not be delivered", ""), "failed");

console.log("PASS bid fax server: always to HPD's bid fax at HumbleFax, cover subject, status confirmed / failed / waiting, read-permission message");
