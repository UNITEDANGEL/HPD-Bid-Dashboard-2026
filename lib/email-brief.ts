// 📩 HPD emails in 20 seconds (app idea list: "when you open the app, the robot sums up new HPD emails out loud: who
// wrote, which job, what they want"). Worked out on the phone from the email's own words (no AI, nothing sent).

const WANTS: [RegExp, string][] = [
  [/\b(highlighted errors|corrections?|correct(ed)? and resubmit|resubmit|re-?submit|errors? (on|in)|incorrect|wrong date|not notarized|notariz)/i, "wants the paperwork fixed and sent again"],
  [/\b(blank|missing (the )?(affidavit|invoice|signature|page|photos?|date)|incomplete)\b/i, "says something is missing or blank"],
  [/\b(affidavit|invoice|paperwork|aff\b|package)\b.{0,40}\b(send|submit|provide|forward|need|required|outstanding)|\b(send|submit|provide|forward)\b.{0,40}\b(affidavit|invoice|paperwork|package)\b/i, "wants the affidavit and invoice"],
  [/\b(photos?|pictures?|pics)\b.{0,30}\b(send|provide|need|required)|\b(send|provide)\b.{0,30}\b(photos?|pictures?)\b/i, "wants photos"],
  [/\b(status|update|when will|has the work|was the work|is the work|eta)\b/i, "wants a status update"],
  [/\b(schedule|appointment|access|date and time|availability)\b/i, "is asking about the appointment / access"],
  [/\b(received|approved|accepted|processed|thank you for (the|your) (submission|documents))\b/i, "says it was received / approved"],
  [/\b(cancel(led)?|rescind|void)\b/i, "says the job is cancelled"],
];

// "Good day Jot," / "Hello," and email leftovers out; the first sentence that says something.
export function firstWords(text: string) {
  const t = String(text || "").replace(/\[cid:[^\]]*\]/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(good (day|morning|afternoon|evening)|hello|hi|dear|greetings)\b[^,.!:]{0,30}[,.!:]?\s*/i, "")
    .replace(/^(kindly|please) note[,:]?\s*/i, "");
  const s = /^(.{8,}?[.!?])(\s|$)/.exec(t)?.[1] || t;
  return s.length > 110 ? `${s.slice(0, 107).replace(/\s+\S*$/, "")}…` : s;
}

export function wantOf(text: string, subject = "") {
  const t = `${subject} ${text}`;
  return WANTS.find(([re]) => re.test(t))?.[1] || "";
}

export type BriefMail = { from: string; omo: string; text: string; subject?: string; at: string };

// "Joy-Ann Lewis about ER05228: wants the paperwork fixed and sent again (“Kindly see attached affidavit…”)".
export function briefLine(m: BriefMail) {
  const who = String(m.from || "HPD").replace(/\s*<.*$/, "").replace(/"/g, "").trim() || "HPD";
  const want = wantOf(m.text, m.subject);
  const words = firstWords(m.text);
  return `${who}${m.omo ? ` about ${m.omo}` : ""}: ${want ? `${want}${words ? ` (“${words}”)` : ""}` : words ? `“${words}”` : "wrote (open it to read)"}`;
}

export function emailBrief(mails: BriefMail[], max = 4) {
  const list = [...mails].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!list.length) return "";
  return `📧 ${list.length} new HPD email${list.length === 1 ? "" : "s"}:\n${list.slice(0, max).map((m) => `• ${briefLine(m)}`).join("\n")}${list.length > max ? `\n…and ${list.length - max} more on the board.` : ""}`;
}
