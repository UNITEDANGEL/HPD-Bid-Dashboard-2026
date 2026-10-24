// The app's voice helper (owner, 22 Oct: "I want you to be my personal agent for this app, I'm able to talk to you:
// 'I finished this job' and you note it; give me the description, talk it out with me"). What was said -> what to
// do. Anything that changes a job is only read back here; the app asks for a yes before saving it.

import { spokenSearch } from "./job-search";

import { parseWhen } from "./voice-when";

export type AgentCommand =
  | { intent: "bid-advice" }
  | { intent: "tenants-waiting" }
  | { intent: "help" }
  | { intent: "tell-tenant"; ref: string; message: string }
  | { intent: "week"; days?: number }
  | { intent: "tracker" }
  | { intent: "money" }
  | { intent: "job-status"; ref: string }
  | { intent: "outcome"; outcome: "WORK_COMPLETED" | "NO_ACCESS_1_WAITING_72H" | "REFUSED_ACCESS" | "PARTIAL_WORK" | "WORK_COMPLETED_BY_OTHERS"; ref: string }
  | { intent: "read-job"; ref: string; pick?: number; all?: boolean }
  | { intent: "bids" }
  | { intent: "come-back" }
  | { intent: "bid-price"; price: number }
  | { intent: "appointment"; ref: string; date?: string; time?: string }
  | { intent: "remind"; what: string; date?: string; time?: string }
  | { intent: "today" }
  | { intent: "notices" }
  | { intent: "yes" }
  | { intent: "no" }
  | { intent: "awards"; days: number; label: string; describe?: boolean }
  | { intent: "text-tenant"; ref: string }
  | { intent: "call-tenant"; ref: string }
  | { intent: "navigate"; ref: string; next: boolean }
  | { intent: "arrived"; ref: string }
  | { intent: "open"; ref: string }
  | { intent: "plan" }
  | { intent: "reply-notice"; ref: string; who: string }
  | { intent: "paperwork"; ref: string }
  | { intent: "ask"; question: string }
  | { intent: "search"; text: string };

const OUTCOMES: [RegExp, AgentCommand extends infer C ? C extends { intent: "outcome"; outcome: infer O } ? O : never : never][] = [
  [/\b(completed by (others|someone else|another contractor)|someone else (did|fixed|finished) it|already (done|fixed) by)\b/i, "WORK_COMPLETED_BY_OTHERS"],
  [/\b(partial(ly)?|part of (the|it)|half (done|finished))\b/i, "PARTIAL_WORK"],
  [/\b(refus(ed|al|e)|wouldn'?t let (me|us) in|denied (access|entry)|turned (me|us) away)\b/i, "REFUSED_ACCESS"],
  [/\b(no access|nobody (was )?(home|there)|no one (was )?(home|there)|couldn'?t get in|can'?t get in|no answer at the door)\b/i, "NO_ACCESS_1_WAITING_72H"],
  [/\b(finish(ed)?|complete(d)?|done( with)?|wrapped up|all done)\b/i, "WORK_COMPLETED"],
];

// What's left after the command words: the job ("ER01987", "707 east 189", "this job" / "" for the one on screen).
function refOf(text: string) {
  const left = spokenSearch(text)
    .replace(/\b(i|we|i'?ve|we'?ve|i'?m|just|have|has|the|a|an|at|on|for|of|with|job|work ?order|omo|number|is|was|it|this|that|one|please|mark|as|me|read|tell|about|what'?s|what is|describe|description|scope|finished|finish|completed|complete|done|wrapped|up|all|no|access|nobody|home|there|tenant|refused|refusal|wouldn'?t|let|in|denied|entry|partial(ly)?|part|half|couldn'?t|can'?t|get|by|others|someone|else|answer|door|today|now|text|message|sms|send|call|phone|navigate|directions|take|drive|go|to|route|start|started|arrived|here|open|show|them|her|him|my|next|stop|please|answer|reply|respond|write|back|notice|lewis|gafur|vendor|tracking|hpd|email|request|paperwork|package|affidavit|invoice|do|make|fill|prepare|generate|finish)\b/gi, " ")
    .replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
  // A job is named by its number or its address (addresses have numbers); anything else means the job on screen.
  return /\d/.test(left) ? left : "";
}

export function parseCommand(heard: string): AgentCommand {
  const t = String(heard || "").trim().toLowerCase().replace(/[.?!]+$/, "");
  const short = t.split(/\s+/).length <= 3;
  if (short && /^(yes|yeah|yep|correct|right|do it|save it|confirm|ok(ay)?|sure)\b/.test(t)) return { intent: "yes" };
  if (short && /^(no|nope|cancel|stop|wrong|never ?mind|don'?t)\b/.test(t) && !/no access/.test(t)) return { intent: "no" };
  // Tenants who were texted and haven't answered (23 Oct): "which tenants haven't answered", "who do I need to call".
  if (/\b(tenants?|who)\b.{0,30}\b(haven'?t|not|didn'?t|no) (answered|replied|answer|reply|texted back|called back)\b|\b(tenants? to call|who (do|should) i (call|need to call))\b/.test(t)) return { intent: "tenants-waiting" };
  // ❓ "What can you do?" / "help" (23 Oct): the examples list.
  if (/^(help|what can (you|i) (do|say|ask)|what do you do|how do i use (you|this)|what are you able to do)\b/.test(t)) return { intent: "help" };
  // Your own words to the tenant (23 Oct): "tell the tenant we'll be there at 10", "reply to the tenant for EQ15239:
  // thank you, see you Thursday", "text them that we're running late".
  {
    const m = /^(?:tell|reply to|message|text|send) (?:the tenant|tenant|them|her|him)(?: (?:for|at|on) ([a-z]{2}\s?\d{5}))?[,:]?\s+(?:that\s+)?(.{6,})$/i.exec(String(heard || "").trim());
    if (m && !/^(for|at|on) [a-z]{2}\s?\d{5}$/i.test(m[2].trim())) return { intent: "tell-tenant", ref: (m[1] || "").replace(/\s/g, "").toUpperCase(), message: m[2].trim().replace(/[.]?$/, ".") };
  }
  // Appointments and reminders by voice (owner, 23 Oct: "create appointments, remind me, route me, all by talking"):
  // "make an appointment for EQ15239 Thursday at 10", "book the tenant tomorrow 2 pm", "remind me to call Lewis at 3".
  if (/\b(make|set|set up|book|schedule|create|add|put)\b.{0,25}\b(appointment|appt|visit)\b|^(appointment|book|schedule)\b/.test(t) && !/\b(how many|what|which|any|list|read)\b/.test(t)) {
    const when = parseWhen(t);
    const ref = (/\b([a-z]{2})\s?(\d{5})\b/i.exec(t) || []).slice(1, 3).join("").toUpperCase();
    return { intent: "appointment", ref, ...(when.date ? { date: when.date } : {}), ...(when.time ? { time: when.time } : {}) };
  }
  {
    const r = /^(?:please )?remind me (?:to |about |that )?(.+)$/.exec(t);
    if (r) {
      const when = parseWhen(r[1]);
      const what = when.words.replace(/\b(on|at|by|in)\s*$/, "").replace(/^(to|about|that)\s+/, "").trim() || r[1];
      return { intent: "remind", what, ...(when.date ? { date: when.date } : {}), ...(when.time ? { time: when.time } : {}) };
    }
  }
  // "What should I bid?" (23 Oct): the open bid answers with its recommended price.
  if (/\b(what|how much) (should|do|would) (i|we) (bid|charge|put)\b|\b(best|recommended|good) (price|bid)\b|\bwhat'?s (the|a) good price\b/.test(t)) return { intent: "bid-advice" };
  // Bid by voice (23 Oct): "bid 500", "bid $1,250 on this one", "price it at 900", "put 750 on it". Fills the open bid
  // and saves it; sending is still your two taps.
  {
    const m = /^(?:bid|price it at|price (?:this|it) at|put|make it|our bid is)\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars?|bucks)?(?:\s+(?:on (?:this|it|this one|that one)|for (?:this|it|this one)))?$/.exec(t);
    if (m) { const price = Number(m[1].replace(/,/g, "")); if (price >= 50 && price <= 100000) return { intent: "bid-price", price }; }
  }
  // "Come back" after a bid was sent and the app moved on to the next one (23 Oct).
  if (/^(come|go|take me) back( to (it|that|that one|the last( one| bid)?|the (bid|one) i (just )?sent))?$/.test(t) || /^back to the last bid$/.test(t)) return { intent: "come-back" };
  // "Plan my day" / "build my route" (22 Oct): Today's route planned for you, then read out.
  if (/\b(plan|build|make|set up|map out)\b.{0,20}\b(my |the |today'?s? )?(day|route|stops)\b/.test(t) || /^where (should|do) i go( first| today)?\b/.test(t)) return { intent: "plan" };
  // "Answer the notice for ER01987" / "reply to Lewis" / "reply to Gafur" (22 Oct).
  if (/\b(answer|reply|respond|write back)\b/.test(t) && /\b(notice|lewis|gafur|vendor tracking|hpd|email|request)\b/.test(t)) return { intent: "reply-notice", ref: refOf(t), who: (/\b(lewis|gafur)\b/.exec(t) || [])[1] || "" };
  // "Do the paperwork for this job" / "send the package" (22 Oct).
  if (/\b(paperwork|package|affidavit|invoice)\b/.test(t) && /\b(do|make|send|open|start|fill|prepare|generate|finish)\b/.test(t)) return { intent: "paperwork", ref: refOf(t) };
  // Doing things by voice (in-app request 22 Oct: "I should be able to talk and get everything done").
  if (/\b(text|message|sms)\b.*\b(tenant|them|her|him|resident)\b|\bsend (a |the )?(text|message|sms)\b/.test(t)) return { intent: "text-tenant", ref: refOf(t) };
  if (/\bcall\b.*\b(tenant|them|her|him|resident)\b|\b(tenant'?s?|resident'?s?) (phone|number)\b/.test(t)) return { intent: "call-tenant", ref: refOf(t) };
  if (/\b(navigate|directions|take me|drive me|get me to|route me|go to|how do i get to)\b/.test(t)) return { intent: "navigate", ref: refOf(t), next: /\bnext\b/.test(t) };
  if (/\b(i'?m here|i am here|i'?ve arrived|i arrived|i'?m at the (job|site|building|address)|start (the |this )?job|starting (the |this )?job)\b/.test(t)) return { intent: "arrived", ref: refOf(t) };
  if (/^(open|show( me)?|pull up)\b.*\b([a-z]{2}\s*\d{5}|job)\b/.test(t) && refOf(t)) return { intent: "open", ref: refOf(t) };
  // "Which jobs have I won today / been awarded this week" (owner, 22 Oct).
  // The phone often hears "won" as "want" / "one" ("which jobs I want today", owner 22 Oct): with "jobs" and a day,
  // those mean won too.
  const wonWords = /\b(won|win|awards?|awarded|confirmation of award)\b/.test(t) || (/\bjobs?\b/.test(t) && /\b(today|yesterday|this week|this month)\b/.test(t) && /\b(want|one|wan|wanna)\b/.test(t));
  if (wonWords && !/\beasiest|chance|price\b/.test(t)) {
    const days = /\byesterday\b/.test(t) ? -1 : /\b(this|the|past|last) week\b|\b7 days\b/.test(t) ? 7 : /\b(this|the|past|last) month\b|\b30 days\b/.test(t) ? 30 : 0;
    // "...and read me the description(s)": each job in plain words too.
    const describe = /\b(read|describe|descriptions?|scope|what (are|were|is) (they|the jobs|it)|tell me about|details?)\b/.test(t);
    return { intent: "awards", days, label: days === -1 ? "yesterday" : days === 7 ? "this week" : days === 30 ? "this month" : "today", describe };
  }
  // 📊 The week in one answer (23 Oct): "how did I do this week", "weekly report", "my week".
  // The day (23 Oct, evening wrap-up): "how did I do today", "how was today", "wrap up my day".
  if (/\b(how (did|was) (i|today|my day)( do| go)? ?(today)?|wrap (up )?(my|the) day|today'?s (report|summary)|sum up (my|the) day)\b/.test(t) && /\b(today|day)\b/.test(t) && !/\b(win|won|award|bids?)\b/.test(t)) return { intent: "week", days: 1 };
  if (/\b(how (did|was) (i|my week|we)( do| go)?( this week)?|weekly (report|summary)|this week'?s (report|summary)|my week|sum up (my|the) week)\b/.test(t) && !/\b(win|won|award)/.test(t)) return { intent: "week" };
  // 🧭 The job tracker (23 Oct): "show my job tracker", "my pipeline", "where are all my jobs".
  if (/\b(job tracker|tracker|pipeline|where are (all )?my jobs|all my jobs by stage)\b/.test(t)) return { intent: "tracker" };
  // A job start to finish (23 Oct, from the award-to-payment plan): "what's left on ER05729", "where are we with this
  // job", "status of EQ15239", "track ER05729".
  if (/\b(what'?s left|what is left|where are we|where do we stand|status of|how far along|track|what'?s next on|what is next on)\b/.test(t) && !/\b(bids?|notices?|today)\b/.test(t)) {
    const job = (/\b([a-z]{2})\s?(\d{5})\b/i.exec(t) || []).slice(1, 3).join("").toUpperCase();
    return { intent: "job-status", ref: job || refOf(t.replace(/\b(what'?s left|what is left|where are we|where do we stand|status of|how far along|track|what'?s next on|what is next on|with|on|for|the|this|job)\b/g, " ")) };
  }
  // Money (23 Oct): "how much does HPD owe me", "what's outstanding", "did I get paid", "money report".
  if (/\b(owe|owes|owed|outstanding|money report|get paid|got paid|been paid|payments?)\b/.test(t) && !/\b(bid|price)\b/.test(t)) return { intent: "money" };
  if (/\b(bids?|invitations?)\b/.test(t) && /\b(read|new|what|any|tell|how many|list)\b/.test(t)) return { intent: "bids" };
  if (/\b(what('?s| is| do i have)?|my|tell me).{0,20}\b(today|day|schedule|plan)\b/.test(t) || /^today\b/.test(t)) return { intent: "today" };
  if (/\bnotices?\b/.test(t) && /\b(open|which|what|any|read|tell|overdue)\b/.test(t)) return { intent: "notices" };
  // "Read me the descriptions" / "the first one" / "number two" right after a list: those jobs (23 Oct, the owner:
  // "it asked me which job, I already told it the jobs I received yesterday").
  const ORD: [RegExp, number][] = [[/\b(first|1st|number one)\b/, 1], [/\b(second|2nd|number two)\b/, 2], [/\b(third|3rd|number three)\b/, 3], [/\b(fourth|4th|number four)\b/, 4], [/\b(fifth|5th|number five)\b/, 5]];
  const pick = (ORD.find(([re]) => re.test(t)) || [null, 0])[1] as number;
  if (/\b(read|describe|descriptions?|what('?s| is| are) (the|this|those|these) jobs?|tell me (about|more)|scope|details?)\b/.test(t) || (pick && /\b(one|job|it|number|about)\b/.test(t))) return { intent: "read-job", ref: refOf(t), ...(pick ? { pick } : {}), ...(/\b(descriptions|all|them|those|these|each|jobs)\b/.test(t) ? { all: true } : {}) };
  // A job outcome needs "I / we / job / work order / this", so a search like "completed jobs" stays a search.
  if (/\b(i|we|i'?ve|we'?ve|job|work ?order|this|tenant|nobody|no one|someone|it)\b/.test(t) || /\bno access\b/.test(t) || /[a-z]{2}\s*\d{5}/.test(t)) for (const [re, outcome] of OUTCOMES) if (re.test(t)) return { intent: "outcome", outcome, ref: refOf(t) };
  // Any other question goes to the AI with the app's facts (owner, 22 Oct: "talk it out with me").
  if (/\?$/.test(String(heard).trim()) || /^(what|which|how|when|why|who|where|can|could|should|would|is|are|do|does|did|will|tell me|give me|explain)\b/.test(t)) return { intent: "ask", question: String(heard).trim() };
  // Said like a sentence, not a search ("anything new from Gafur", "HPD gave me work today?"): the AI answers it
  // (owner, 23 Oct: "make AI much better, ask in different ways"). Searches are job numbers, addresses and job words.
  if (!/\d/.test(t) && t.split(/\s+/).length >= 3 && /\b(i|me|my|we|us|you|anything|any|new|did|do|does|have|has|got|get|need|needs|should|can|could|would|will|from|today|tonight|tomorrow|yesterday|this week|money|owe|owed|paid|pay)\b/.test(t)) return { intent: "ask", question: String(heard).trim() };
  return { intent: "search", text: spokenSearch(heard) };
}

// Several things in one sentence (owner, 23 Oct: "ask multiple questions in different ways"): "how many jobs did I
// win today and what bids are due tomorrow" -> each part on its own, answered one after the other. Only split when
// every part is understood; "…won today, read me the description" stays one (the wins, read out).
export function splitCommands(heard: string): string[] {
  const whole = parseCommand(heard);
  if (whole.intent === "awards" && whole.describe) return [heard];
  const pieces = String(heard || "")
    .split(/\s*(?:\?|;|\band also\b|\balso\b|\band then\b|\bthen\b|,?\s+and\s+(?=(?:what|which|how|when|where|who|read|tell|give|show|any|do|did|does|is|are|text|call|plan|take|navigate|open|reply|answer|i)\b))\s*/i)
    .map((p) => p.trim().replace(/^(and|also|then)\s+/i, ""))
    .filter((p) => p.split(/\s+/).length >= 2);
  if (pieces.length < 2) return [heard];
  const kinds = pieces.map(parseCommand);
  if (kinds.some((k) => k.intent === "search" || k.intent === "yes" || k.intent === "no")) return [heard];
  return pieces.slice(0, 4);
}

// Which of your jobs was meant: the job number, else every word in the address; "" = the job on screen.
export function findJobRef<T>(ref: string, jobs: T[], idOf: (j: T) => string, addressOf: (j: T) => string): T | null | "many" {
  const r = ref.trim();
  if (!r) return null;
  const omo = (r.toUpperCase().replace(/\s/g, "").match(/[A-Z]{2}\d{5}/) || [])[0];
  if (omo) return jobs.find((j) => idOf(j).toUpperCase() === omo) || null;
  const words = r.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return null;
  const hits = jobs.filter((j) => { const a = addressOf(j).toLowerCase().replace(/[^\w\s]/g, " "); return words.every((w) => a.includes(w)); });
  return hits.length === 1 ? hits[0] : hits.length > 1 ? "many" : null;
}
