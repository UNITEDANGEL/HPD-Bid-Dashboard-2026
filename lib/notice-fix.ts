// 👉 Do this (owner, 9 Nov: "tell me just very easily: go here, fix this ... there was a notary stamp missing or a lot
// of data missing ... I want it to be not confusing"). Every open vendor tracking notice gets ONE plain line saying
// what to do now, and when HPD sent the paperwork back, the fix in short steps (from their own email), so nobody has
// to read the whole conversation. Nothing is sent from here: the button opens the reply or the paperwork, which keep
// their own two taps.
import type { BoardRow } from "./notice-board";

export type FixAction = "correct" | "resend" | "photos" | "reply" | "visit" | "paperwork" | "send" | "nudge" | "wait";
export type PlainFix = { headline: string; steps: string[]; action: FixAction; button: string; tone: "late" | "fix" | "todo" | "wait" };

// What HPD wrote back, as short steps to fix it.
export function fixSteps(text: string): { steps: string[]; action: "correct" | "resend" | "photos" } {
  const t = String(text || "");
  const steps: string[] = [];
  if (/\bblank\b|can ?not open|won'?t open|empty/i.test(t)) return { action: "resend", steps: ["The copy you sent was blank: open the PDF to check it, then send it again."] };
  const photosAsk = /photo|video/i.test(t) && !/affidavit[^.]*(error|incorrect|missing|highlight)/i.test(t);
  if (photosAsk) {
    steps.push("Send the before-and-after photos and the video.");
    if (/no need to resubmit|already submitted the affidavit/i.test(t)) steps.push("Don't send the affidavit and invoice again.");
    return { action: "photos", steps };
  }
  if (/highlight/i.test(t)) steps.push("Open their copy: fix every highlighted spot.");
  if (/incomplete|missing information|missing info|blank (field|area|box)/i.test(t)) steps.push("Fill in every empty box.");
  if (/notari[sz]/i.test(t)) steps.push("Notary stamp and notary signature on every page (a real notary).");
  if (/confirmation date of award|date directed by hpd|award date/i.test(t)) steps.push("Affidavit date = the award confirmation date.");
  if (/not signed|unsigned|signature/i.test(t)) steps.push("Sign it in ink.");
  if (/illegible|not legible|unreadable/i.test(t)) steps.push("Scan it again so every word is clear.");
  if (/invoice/i.test(t) && /amount|total|price/i.test(t)) steps.push("Check the invoice amount matches the award.");
  if (!steps.length) steps.push("Open their email, fix what they point out.");
  steps.push("Keep the same dates as the original, then send it back.");
  return { action: "correct", steps };
}

// What the owner calls them on the board ("Lewis", "Gafur"); greetings keep the first name.
const first = (who: string) => (/lewis/i.test(who) ? "Lewis" : /gafur/i.test(who) ? "Gafur" : (who || "Vendor tracking").split(/\s+/)[0]);
const hello = (who: string) => (who || "").trim().split(/\s+/)[0] || "";
const DAY = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric" });

// The one line on top of a notice card. visit: the next visit set for the job ("Tue 11/11"), if any.
export function plainFix(row: BoardRow, opts: { now?: number; visit?: string; quietDays?: number } = {}): PlainFix | null {
  if (!row.next) return null;
  const now = opts.now ?? Date.now();
  const name = first(row.who);
  const late = row.kind === "ppn" && !row.steps.sent.done && !!row.dueAt && Date.parse(row.dueAt) < now;
  if (row.problem) {
    const f = fixSteps(row.problem.text);
    const what = f.action === "resend" ? "the copy was blank" : f.action === "photos" ? "they want photos and video" : "they sent it back with errors";
    return { headline: `🛠 Fix it: ${what}.`, steps: f.steps, action: f.action === "photos" ? "photos" : f.action, button: f.action === "resend" ? "📤 Open it and send again" : f.action === "photos" ? "📸 Send the photos" : "🛠 Fix it now", tone: "fix" };
  }
  if (row.filed && !row.steps.sent.done) return { headline: `📎 Already emailed ${DAY(row.filed.at)}. Tell ${name} the date; don't send it again.`, steps: [], action: "reply", button: `✉ Tell ${name}`, tone: "todo" };
  if (opts.visit && !row.steps.sent.done) return { headline: `📅 You go ${opts.visit}. Tell ${name} so the notice is answered.`, steps: [], action: "visit", button: `✉ Tell ${name} the day`, tone: late ? "late" : "todo" };
  if (row.next === "replied") return { headline: late ? `🔥 Overdue. Send ${name} a short update now: in touch, the day you go.` : `✉ Answer ${name}: a short update (in touch, the day you go).`, steps: [], action: "reply", button: `✉ Update ${name}`, tone: late ? "late" : "todo" };
  if (row.next === "made") return { headline: late ? "🔥 Overdue. Make the paperwork: what happened at the job?" : "📄 Make the paperwork: what happened at the job?", steps: [], action: "paperwork", button: "📄 Make it", tone: late ? "late" : "todo" };
  if (row.next === "sent") return { headline: `📤 Paperwork is ready. Email it to ${name}.`, steps: [], action: "send", button: "📤 Send it", tone: late ? "late" : "todo" };
  if (opts.quietDays) return { headline: `⏰ Sent, no answer in ${opts.quietDays} days. Ask ${name} to confirm.`, steps: [], action: "nudge", button: "⏰ Ask to confirm", tone: "wait" };
  return { headline: `⏳ Sent. Waiting for ${name} to confirm.`, steps: [], action: "wait", button: "", tone: "wait" };
}

// A short update to vendor tracking (owner, 9 Nov: "we are in touch with this job, we are going on this day, we'll try
// to get it done ... or this is work in progress, scheduled for next week").
export type VtLine = { key: string; label: string; text: (omo: string, day: string) => string };
export const VT_LINES: VtLine[] = [
  { key: "touch", label: "🤝 In touch · going on a day", text: (o, d) => `We are in touch on OMO# ${o}. We are going ${d || "this week"} and will try to get it done that day.` },
  { key: "progress", label: "🚧 Work in progress", text: (o) => `The work on OMO# ${o} is in progress. We will send the affidavit and invoice as soon as it is finished.` },
  { key: "nextweek", label: "📅 Scheduled next week", text: (o, d) => `OMO# ${o} is scheduled for next week${d ? ` (${d})` : ""}. We will update you after the visit.` },
  { key: "tenant", label: "📞 Waiting on the tenant", text: (o) => `We are calling the tenant on OMO# ${o} to set a day for access. We will let you know the day as soon as it is set.` },
];

// "Tuesday 11/11" for a yyyy-mm-dd day.
export const vtDay = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? `on ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "numeric", day: "numeric" })}` : "");

// The update email for a notice whose visit is set (the board's "Tell Lewis the day").
export function visitUpdate(row: BoardRow, address: string, visitLong: string) {
  return {
    subject: `RE: ${row.subject}`.slice(0, 200),
    text: `Hello${hello(row.who) ? ` ${hello(row.who)}` : ""},\n\nRe: OMO# ${row.omo}${address ? ` - ${address}` : ""}\n\nWe are in touch with the tenant. We are going ${visitLong} and will try to get the work done that day. We will send the affidavit and invoice right after.\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`,
  };
}
