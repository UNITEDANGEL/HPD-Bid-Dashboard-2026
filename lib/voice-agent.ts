// The app's voice helper (owner, 22 Oct: "I want you to be my personal agent for this app, I'm able to talk to you:
// 'I finished this job' and you note it; give me the description, talk it out with me"). What was said -> what to
// do. Anything that changes a job is only read back here; the app asks for a yes before saving it.

import { spokenSearch } from "./job-search";

export type AgentCommand =
  | { intent: "outcome"; outcome: "WORK_COMPLETED" | "NO_ACCESS_1_WAITING_72H" | "REFUSED_ACCESS" | "PARTIAL_WORK" | "WORK_COMPLETED_BY_OTHERS"; ref: string }
  | { intent: "read-job"; ref: string }
  | { intent: "bids" }
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
    .replace(/\b(i|we|i'?ve|we'?ve|i'?m|just|have|has|the|a|an|at|on|for|of|with|job|work ?order|omo|number|is|was|it|this|that|one|please|mark|as|me|read|tell|about|what'?s|what is|describe|description|scope|finished|finish|completed|complete|done|wrapped|up|all|no|access|nobody|home|there|tenant|refused|refusal|wouldn'?t|let|in|denied|entry|partial(ly)?|part|half|couldn'?t|can'?t|get|by|others|someone|else|answer|door|today|now|text|message|sms|send|call|phone|navigate|directions|take|drive|go|to|route|start|started|arrived|here|open|show|them|her|him|my|next|stop|please)\b/gi, " ")
    .replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
  // A job is named by its number or its address (addresses have numbers); anything else means the job on screen.
  return /\d/.test(left) ? left : "";
}

export function parseCommand(heard: string): AgentCommand {
  const t = String(heard || "").trim().toLowerCase().replace(/[.?!]+$/, "");
  const short = t.split(/\s+/).length <= 3;
  if (short && /^(yes|yeah|yep|correct|right|do it|save it|confirm|ok(ay)?|sure)\b/.test(t)) return { intent: "yes" };
  if (short && /^(no|nope|cancel|stop|wrong|never ?mind|don'?t)\b/.test(t) && !/no access/.test(t)) return { intent: "no" };
  // "Plan my day" / "build my route" (22 Oct): Today's route planned for you, then read out.
  if (/\b(plan|build|make|set up|map out)\b.{0,20}\b(my |the |today'?s? )?(day|route|stops)\b/.test(t) || /^where (should|do) i go( first| today)?\b/.test(t)) return { intent: "plan" };
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
  if (/\b(bids?|invitations?)\b/.test(t) && /\b(read|new|what|any|tell|how many|list)\b/.test(t)) return { intent: "bids" };
  if (/\b(what('?s| is| do i have)?|my|tell me).{0,20}\b(today|day|schedule|plan)\b/.test(t) || /^today\b/.test(t)) return { intent: "today" };
  if (/\bnotices?\b/.test(t) && /\b(open|which|what|any|read|tell|overdue)\b/.test(t)) return { intent: "notices" };
  if (/\b(read|describe|description|what('?s| is) (the|this) job|tell me about|scope)\b/.test(t)) return { intent: "read-job", ref: refOf(t) };
  // A job outcome needs "I / we / job / work order / this", so a search like "completed jobs" stays a search.
  if (/\b(i|we|i'?ve|we'?ve|job|work ?order|this|tenant|nobody|no one|someone|it)\b/.test(t) || /\bno access\b/.test(t) || /[a-z]{2}\s*\d{5}/.test(t)) for (const [re, outcome] of OUTCOMES) if (re.test(t)) return { intent: "outcome", outcome, ref: refOf(t) };
  // Any other question goes to the AI with the app's facts (owner, 22 Oct: "talk it out with me").
  if (/\?$/.test(String(heard).trim()) || /^(what|which|how|when|why|who|where|can|could|should|would|is|are|do|does|did|will|tell me|give me|explain)\b/.test(t)) return { intent: "ask", question: String(heard).trim() };
  return { intent: "search", text: spokenSearch(heard) };
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
