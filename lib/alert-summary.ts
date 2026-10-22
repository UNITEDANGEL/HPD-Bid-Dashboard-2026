// What an HPD email wants, in one plain line (owner, 22 Oct: "summarize the request: if it's missing documents, just
// tell me which work order they're looking for"), and the words the phone says out loud for each alert ("I want an
// actual voice: urgent email, message from Lewis, requesting documents, new invitation to bid, confirmation of award").
// Shared by the app (banner + voice) and the phone alerts (scripts/send-push.mjs).

const OMO = /\b[A-Z]{2}\d{5}\b/g;

// Their words only: no greeting, no signature, no quoted earlier emails.
export function cleanEmailText(text: string) {
  let t = String(text || "").replace(/\r/g, "").replace(/\[cid:[^\]]*\]/g, "").replace(/<(https?:|mailto:)[^>]*>/g, "").replace(/https?:\/\/\S+/g, "");
  t = t.split(/\n\s*On .{5,120}wrote:\s*\n|\n-{2,}\s*Original Message|\nFrom: .+\nSent: |\n\s*_{5,}/i)[0];
  t = t.split(/\n\s*(Best|Best regards|Regards|Thank you|Thanks|Sincerely|Respectfully)[,!.]?\s*\n/i)[0];
  // Signature lines without a "Best," (name | title, "(She/Her)", the office address, emails).
  t = t.split("\n").filter((l) => !/\|.*(tracker|program|hpd)|\((she|he|they)\/|housing preservation|100 gold|@hpd\.nyc\.gov|alternative enforcement/i.test(l)).join("\n");
  t = t.replace(/^\s*(good (day|morning|afternoon)|hello|hi|dear|greetings)\b[^\n]*\n/i, "");
  return t.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

const want = (s: string) => s.replace(/\s+/g, " ").replace(/[.;]+$/, "").trim().toLowerCase();

// "Missing documents for 15 work orders: EP27489 affidavit and invoice, EP27382 affidavit and invoice +13 more"
export function summarizeHpd(input: { kind?: string; subject?: string; text?: string; omo?: string }) {
  const body = cleanEmailText(input.text || "");
  const subject = String(input.subject || "");
  // A list: "1. EP27489 – Affidavit and Invoice" lines.
  const items: [string, string][] = [];
  for (const m of body.matchAll(/([A-Z]{2}\d{5})\s*[-–:]\s*([^\n]{3,80})/g)) if (!items.some(([o]) => o === m[1])) items.push([m[1], want(m[2])]);
  if (items.length >= 2) {
    const shown = items.slice(0, 2).map(([o, w]) => `${o} ${w}`).join(", ");
    return `Missing documents for ${items.length} work orders: ${shown}${items.length > 2 ? ` and ${items.length - 2} more` : ""}`;
  }
  if (items.length === 1) return `They want ${items[0][1]} for ${items[0][0]}`;
  if (/^received\.?$/i.test(body) || /^(received|got it)[.!]?\s*(thank|$)/i.test(body)) return "They received it";
  // Lewis's subjects say what's wrong: "OMO#ER01919- INCOMPLETE INVOICE", "OMO#ER06498- STATUS UPDATE".
  const omo = input.omo || (subject.match(OMO) || [])[0] || "";
  if (/status update/i.test(subject + " " + body) && omo) return `They want a status update on ${omo}${/completion.{0,30}passed|passed/i.test(body) ? ": the completion date has passed" : ""}`;
  const issue = /OMO\s*#?\s*[A-Z]{2}\d{5}\s*[-–:]\s*(.{4,60})$/i.exec(subject.trim());
  if (issue && !/status update/i.test(issue[1])) return `${issue[1].trim().replace(/&/g, "and").toLowerCase().replace(/^./, (c) => c.toUpperCase())} on ${omo}`;
  // Notices: what they want from the subject / text.
  if (input.kind === "notice" || /performance notice|\b(24|72)[ -]?h(ou)?r/i.test(subject)) {
    const hrs = /72/.test(subject) ? "72" : "24";
    const ask = /affidavit|invoice/i.test(body) ? "the affidavit and invoice" : /photo/i.test(body) ? "photos" : "an update or the affidavit and invoice";
    return `${hrs}-hour notice: they want ${ask}${input.omo ? ` for ${input.omo}` : ""}`;
  }
  const docs = [/affidavit/i.test(body) && "affidavit", /invoice/i.test(body) && "invoice", /photo/i.test(body) && "photos", /start date/i.test(body) && "the start date", /complet(ion|ed) date/i.test(body) && "the completion date"].filter(Boolean) as string[];
  if (docs.length && /(please|kindly|need|missing|provide|submit|send|confirm)/i.test(body)) {
    const omos = [...new Set(body.match(OMO) || (input.omo ? [input.omo] : []))];
    return `They want ${docs.join(" and ")}${omos.length ? ` for ${omos.slice(0, 3).join(", ")}` : ""}`;
  }
  // Otherwise their first real sentence.
  const first = body.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).find((s) => s.length > 12) || subject;
  return first.length > 150 ? `${first.slice(0, 147)}…` : first;
}

// "EP27489" -> "E P 2 7 4 8 9" (so the voice reads the work order, not "ep twenty-seven thousand").
export const sayOmo = (s: string) => s.replace(OMO, (o) => o.split("").join(" "));

const strip = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "").replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
const firstName = (who = "") => (who.replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(-1)[0] || "");

// The words said out loud for an alert.
export function spokenAlert(n: { kind: string; title: string; text?: string; omo?: string; who?: string }) {
  const omo = n.omo ? `work order ${n.omo}` : "";
  const who = firstName(n.who) || ((/(from|·)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z-]+)*)\)?$/.exec(n.title) || [])[2] || "").split(" ").slice(-1)[0] || "";
  const text = n.text ? strip(n.text) : "";
  const title = strip(n.title);
  let words: string;
  switch (n.kind) {
    case "award": words = `Confirmation of award! You won ${omo || "a job"}.`; break;
    case "bid": words = `New invitation to bid. ${omo}. ${text}`; break;
    case "notice": words = `Urgent email. ${/72/.test(n.title + text) ? "72" : "24"}-hour notice${who ? ` from ${who}` : ""}, ${omo}. ${text}`; break;
    case "request": words = /^they received it/i.test(text) ? `${who || "H P D"} replied: received.` : `Request from ${who || "H P D"}${/document/i.test(n.title + text) ? ", requesting documents" : ""}. ${text || omo}`; break;
    case "rejection": words = `Payment rejected, ${omo}. ${text}`; break;
    case "message": words = `Email from ${who || "H P D"}${omo ? `, ${omo}` : ""}. ${text}`; break;
    case "fax-ok": words = `Fax confirmed. ${title.replace(/^fax (went through|confirmed)[,:]?\s*/i, "")}`; break;
    case "fax-bad": words = `Fax failed. ${title.replace(/^fax failed[,:]?\s*/i, "")}. ${text}`; break;
    case "urgent": words = `Urgent. ${title}. ${text}`; break;
    default: words = `${title}. ${text}`;
  }
  words = words.replace(/\bOMO\s*(#|No\.?:?)?\s*(?=[A-Z]{2}\d{5})/gi, "work order ").replace(/\bwork order work order\b/gi, "work order").replace(/\bHPD\b/g, "H P D").replace(/\s+([.,])/g, "$1").replace(/\.\s*\./g, ".").replace(/,\s*\./g, ".").replace(/\s+/g, " ").trim();
  return sayOmo(words.length > 320 ? `${words.slice(0, 317)}…` : words);
}
