import { saveReply, twilioSignatureOk } from "../../server/tenant-sms.mjs";

// POST /api/sms-inbound: Twilio calls this when a tenant texts the business number back (set it as the number's
// "A message comes in" webhook). Only Twilio's signed requests are taken; the reply waits in the app's private inbox.
export async function onRequestPost({ request, env }) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const ok = await twilioSignatureOk(env.TWILIO_AUTH_TOKEN, request.url, params, request.headers.get("X-Twilio-Signature") || "");
  if (!ok) return new Response("Not signed by Twilio.", { status: 403 });
  const from = String(params.get("From") || "").slice(0, 20);
  const body = String(params.get("Body") || "").slice(0, 640);
  if (from && env.HPD_DRIVE_SESSIONS) await saveReply(env.HPD_DRIVE_SESSIONS, { from, body, at: new Date().toISOString(), sid: String(params.get("MessageSid") || "").slice(0, 40) });
  // Empty answer: no automatic text back (Twilio still answers STOP / HELP by itself).
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
