// Texts to tenants from the business number (owner, 23 Oct: "build the text service; the AI can send texts for me").
// Twilio sends them; the owner's Twilio account is set up with these Cloudflare secrets (never in the code):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (the business number, +1...) or TWILIO_MESSAGING_SERVICE_SID.
// Replies come back to /api/sms-inbound (set as the number's "A message comes in" webhook in Twilio) and wait in a small
// private inbox for the app. Twilio handles STOP / START opt-outs on its side.

export function smsReady(env) {
  return Boolean(env?.TWILIO_ACCOUNT_SID && env?.TWILIO_AUTH_TOKEN && (env?.TWILIO_FROM || env?.TWILIO_MESSAGING_SERVICE_SID));
}

// A US mobile / landline number as +1XXXXXXXXXX, or "" when it isn't one.
export function usPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : "";
}

export async function sendSms(env, to, text, fetcher = fetch) {
  if (!smsReady(env)) return { sent: false, reason: "not-set-up" };
  const phone = usPhone(to);
  if (!phone) return { sent: false, reason: "That isn't a US phone number." };
  const body = String(text || "").replace(/\s+\n/g, "\n").trim();
  if (body.length < 5 || body.length > 640) return { sent: false, reason: "The text must be 5 to 640 characters." };
  const form = new URLSearchParams({ To: phone, Body: body });
  if (env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", env.TWILIO_FROM);
  const r = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { sent: false, reason: `Twilio didn't send it (${d.code ? `error ${d.code}: ` : ""}${String(d.message || `HTTP ${r.status}`).slice(0, 160)}).` };
  return { sent: true, sid: String(d.sid || ""), status: String(d.status || "queued"), to: `***${phone.slice(-4)}` };
}

// Twilio signs each webhook: HMAC-SHA1 of the full URL + every form field (sorted, name then value), base64.
export async function twilioSignatureOk(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const INBOX = "sms:inbox";
// The last 100 replies (one KV key, written only when a text comes in).
export async function saveReply(kv, reply) {
  let list = [];
  try { list = JSON.parse((await kv.get(INBOX)) || "[]"); } catch { list = []; }
  list.push(reply);
  await kv.put(INBOX, JSON.stringify(list.slice(-100)));
}
export async function readReplies(kv, since = "") {
  let list = [];
  try { list = JSON.parse((await kv.get(INBOX)) || "[]"); } catch { list = []; }
  return since ? list.filter((r) => r.at > since) : list;
}
