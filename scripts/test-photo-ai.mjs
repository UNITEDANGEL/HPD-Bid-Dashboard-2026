// 📷 Read a photo on the server (3 Nov): photoFacts checks the picture, aiReadPhoto sends it to Cloudflare's vision
// model (faked here: no AI call, no cost), accepts the model's license once when asked, and the answer comes back
// without phone numbers.
import assert from "node:assert/strict";
import { aiReadPhoto, cleanPhoto, photoFacts, PHOTO_MODEL } from "../server/ai-draft.mjs";

const jpeg = Buffer.alloc(600, 7).toString("base64");
assert.equal(photoFacts({ image: "abc" }), null, "too small");
assert.equal(photoFacts({ image: `${jpeg}<script>` }), null, "not base64");
assert.equal(photoFacts({ image: "A".repeat(2_000_001) }), null, "too big");
const p = photoFacts({ image: `data:image/jpeg;base64,${jpeg}` });
assert.equal(p.image, jpeg);
assert.equal(p.question, "What is this, and what should I do?");

const calls = [];
let agreed = false;
const env = { AI: { run: async (model, input) => {
  calls.push({ model, input });
  if (input.prompt === "agree") { agreed = true; return { response: "ok" }; }
  if (!agreed) throw new Error("5016: Prior to using this model, you must submit the prompt 'agree'.");
  return { response: "This is a **24-hour notice** for EQ15239 due 11/4. Call the super at (718) 555-0123 before you go." };
} } };
const r = await aiReadPhoto(env, p);
assert.equal(r.ai, true);
assert.equal(r.model, PHOTO_MODEL);
assert.equal(r.text, "This is a 24-hour notice for EQ15239 due 11/4. Call the super at [number] before you go.");
assert.deepEqual(calls.map((c) => c.input.prompt === "agree" ? "agree" : "read"), ["read", "agree", "read"]);
assert.equal(calls[2].input.image.length, 600, "the picture's bytes go to the model");
assert.equal(calls[2].input.image[0], 7);
assert.deepEqual((await aiReadPhoto({}, p)), { ai: false, reason: "not-set-up" });
assert.equal(cleanPhoto("call 212-555-0199 or 3475550100"), "call [number] or [number]");
console.log("PASS photo AI: picture checked, sent as bytes, license accepted once when asked, phone numbers taken out, no AI = not set up");
