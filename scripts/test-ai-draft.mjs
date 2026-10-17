// AI-written replies (server/ai-draft.mjs): Workers AI or Anthropic when set up, otherwise { ai: false };
// the answer must be about this OMO; the server action never sends anything.
import assert from "node:assert/strict";
import { aiDraft, cleanDraft, draftFacts } from "../server/ai-draft.mjs";
import { handleDrivePackages } from "../server/drive-packages.mjs";

const body = { omo: "ER05228", address: "6 WEST 132 STREET", who: "Joy-Ann Lewis", hours: 24, noticeAt: "2026-10-16T15:39:00-04:00", dueAt: "2026-10-17T19:39:00.000Z", hoursLeft: 5.25, sentAt: "2026-10-02", steps: { replied: false, made: true, sent: false }, note: "say we will email it tonight", noticeText: "Please provide the affidavit and invoice." };
const facts = draftFacts(body);
assert.equal(facts.omo, "ER05228");
assert.equal(facts.notice, "24-hour poor performance notice");
assert.equal(facts.paperworkOnRecord, "2026-10-02");
assert.equal(facts.hoursLeft, 5.3);
assert.equal(draftFacts({ omo: "x; drop" }), null, "a real OMO only");
assert.equal(draftFacts({ ...body, noticeText: "y".repeat(9000) }).theirEmail.length, 2500, "their email is clipped");

const good = "Hello Joy-Ann,\n\nRe: OMO# ER05228 - 6 WEST 132 STREET\n\nThe affidavit and invoice were sent on 10/2/2026. We will email them again tonight.\n\nThank you,\nJot Singh\nUnited Angel Construction Corp";
// Workers AI.
let seen = null;
const cf = { AI: { run: async (model, input) => { seen = { model, input }; return { response: good }; } } };
let r = await aiDraft(cf, facts);
assert.equal(r.ai, true);
assert.equal(r.text, good);
assert.match(seen.model, /^@cf\//);
assert.match(seen.input.messages[0].content, /Never invent/);
assert.match(seen.input.messages[1].content, /"omo": "ER05228"/);
// Anthropic.
let call = null;
r = await aiDraft({ ANTHROPIC_API_KEY: "test-key" }, facts, async (url, opts) => { call = { url, opts }; return Response.json({ content: [{ type: "text", text: good }] }); });
assert.equal(r.ai, true);
assert.equal(call.url, "https://api.anthropic.com/v1/messages");
assert.equal(call.opts.headers["x-api-key"], "test-key");
assert.match(JSON.parse(call.opts.body).model, /^claude-/);
// An answer that isn't about this job is refused; an unsigned one gets the signature.
assert.equal((await aiDraft({ AI: { run: async () => ({ response: "Hello, about OMO# EQ99999" }) } }, facts)).ai, false);
assert.match(cleanDraft("Hello,\nRe: OMO# ER05228\nSent.", "ER05228"), /Thank you,\nJot Singh\nUnited Angel Construction Corp$/);
// Not set up.
assert.deepEqual(await aiDraft({}, facts), { ai: false, reason: "not-set-up" });

// The server action: signed-in only (via handleDriveAuth), never touches Gmail.
const mail = [];
const auth = { Authorization: "Bearer test" };
const res = await handleDrivePackages(new Request("https://app.example.test/api/drive/hpd-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "hpd-draft", auth, async (u) => { mail.push(u); return Response.json({}); }, cf, "owner@example.test");
assert.equal(res.status, 200);
assert.equal((await res.json()).text, good);
assert.equal(mail.length, 0, "nothing was sent");
const bad = await handleDrivePackages(new Request("https://app.example.test/api/drive/hpd-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ omo: "nope" }) }), "hpd-draft", auth, async () => Response.json({}), cf, "owner@example.test");
assert.equal(bad.status, 400);
console.log("PASS AI draft: facts only (OMO checked, their email clipped), Workers AI and Anthropic paths, off-topic answers refused, not set up -> ai:false, the action never sends");
