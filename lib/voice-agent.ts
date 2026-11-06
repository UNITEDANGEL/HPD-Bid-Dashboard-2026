// The app's voice helper (owner, 22 Oct: "I want you to be my personal agent for this app, I'm able to talk to you:
// 'I finished this job' and you note it; give me the description, talk it out with me"). What was said -> what to
// do. Anything that changes a job is only read back here; the app asks for a yes before saving it.

import { spokenSearch } from "./job-search";

import { parseWhen, parsePastDay } from "./voice-when";
import { isNotesQuestion, parseRemember } from "./voice-notes";

export type AgentCommand =
  | { intent: "forecast" }
  | { intent: "paid-period"; period: "month" | "last-month" | "year" | "last-year" }
  | { intent: "rejections" }
  | { intent: "tenant-texts" }
  | { intent: "appointments"; when: "today" | "tomorrow" | "all" }
  | { intent: "no-bid"; reason: string }
  | { intent: "appt-confirmed"; ref: string }
  | { intent: "called"; ref: string; result: "no-answer" | "voicemail" | "talked"; said: string }
  | { intent: "bid-advice" }
  | { intent: "tenants-waiting" }
  | { intent: "help" }
  | { intent: "remember"; text: string }
  | { intent: "my-notes" }
  | { intent: "whats-next" }
  | { intent: "claude-status" }
  | { intent: "claude-works" }
  | { intent: "whats-new" }
  | { intent: "walkthrough"; ref: string }
  | { intent: "tour" }
  | { intent: "teach" }
  | { intent: "materials" }
  | { intent: "missing-paperwork" }
  | { intent: "hands-free-day" }
  | { intent: "paid-check"; ref: string }
  | { intent: "on-my-way"; ref: string }
  | { intent: "month-report"; last?: boolean }
  | { intent: "losing-time" }
  | { intent: "good-news" }
  | { intent: "before-after"; ref: string }
  | { intent: "find"; query: string }
  | { intent: "price-check"; price: number }
  | { intent: "week-ahead" }
  | { intent: "late"; ref: string }
  | { intent: "ideas" }
  | { intent: "idea-do"; n: number }
  | { intent: "ideas-more" }
  | { intent: "auto-upgrade"; on: boolean }
  | { intent: "catch-up" }
  | { intent: "bid-usual" }
  | { intent: "driving"; on: boolean }
  | { intent: "photo" }
  | { intent: "claude-not-right"; text: string }
  | { intent: "open-pick"; pick: number }
  | { intent: "next-tenant" }
  | { intent: "weather"; when: "today" | "tomorrow"; work?: string }
  | { intent: "traffic" }
  | { intent: "asp"; when: "today" | "tomorrow" }
  | { intent: "store"; store: string }
  | { intent: "store-stop" }
  | { intent: "translate"; lang: string }
  | { intent: "hpd-call"; ref: string }
  | { intent: "hpd-note"; ref: string; text: string }
  | { intent: "streaks" }
  | { intent: "building"; ref: string }
  | { intent: "drive-time"; ref: string }
  | { intent: "app-request"; text: string }
  | { intent: "tell-tenant"; ref: string; message: string }
  | { intent: "week"; days?: number; friday?: boolean }
  | { intent: "tracker" }
  | { intent: "money" }
  | { intent: "job-status"; ref: string }
  | { intent: "outcome"; outcome: "WORK_COMPLETED" | "NO_ACCESS_1_WAITING_72H" | "REFUSED_ACCESS" | "PARTIAL_WORK" | "WORK_COMPLETED_BY_OTHERS"; ref: string; date?: string; who?: string }
  | { intent: "read-job"; ref: string; pick?: number; all?: boolean }
  | { intent: "bids" }
  | { intent: "bids-show"; boro: string; day: "all" | "0" | "1" }
  | { intent: "next-bid"; day?: "0" | "1" }
  | { intent: "notice-walk"; next: boolean }
  | { intent: "notice-handled"; ref: string }
  | { intent: "where-appt"; at: number }
  | { intent: "come-back" }
  | { intent: "bid-price"; price: number }
  | { intent: "appointment"; ref: string; date?: string; time?: string }
  | { intent: "remind"; what: string; date?: string; time?: string }
  | { intent: "today" }
  | { intent: "recap" }
  | { intent: "snooze" }
  | { intent: "plan-week" }
  | { intent: "plan-do-all" }
  | { intent: "notices" }
  | { intent: "yes" }
  | { intent: "no" }
  | { intent: "awards"; days: number; label: string; describe?: boolean }
  | { intent: "text-tenant"; ref: string }
  | { intent: "call-tenant"; ref: string }
  | { intent: "navigate"; ref: string; next: boolean; there?: boolean }
  | { intent: "arrived"; ref: string }
  | { intent: "open"; ref: string }
  | { intent: "plan" }
  | { intent: "route-add"; ref: string }
  | { intent: "route-remove"; ref: string }
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

// The day it happened and, for a refusal, who refused, said with the outcome (31 Oct: "refused access EQ15239 yesterday,
// male, tall, dark hair"): both taken out before the job is looked up, so "10/24" or "tall" isn't read as an address.
export const WHO_START = /\b(?:by )?(?:an? |the )?(male|female|man|woman|guy|lady|boy|girl|young|old|older|elderly|super|superintendent|porter|handyman|landlord|owner|son|daughter|husband|wife|mother|father|grand(?:mother|father|ma|pa))\b/;
function outcomeCommand(t: string, outcome: Extract<AgentCommand, { intent: "outcome" }>["outcome"]): AgentCommand {
  const when = parsePastDay(t);
  let rest = when.words;
  let who = "";
  if (outcome === "REFUSED_ACCESS") {
    const m = WHO_START.exec(rest);
    if (m) {
      who = rest.slice(m.index).replace(/^by\s+/, "").replace(/\b(refused|refusal|access|denied|entry)\b/g, " ").replace(/\s+/g, " ").trim();
      rest = rest.slice(0, m.index);
    }
  }
  return { intent: "outcome", outcome, ref: refOf(rest), ...(when.date ? { date: when.date } : {}), ...(who ? { who } : {}) };
}

const BORO_CODE: Record<string, string> = { manhattan: "MN", bronx: "BX", brooklyn: "BK", queens: "QN", "staten island": "SI" };

// 🧠 A question that needs thinking, not a list (owner, 4 Nov: "make the bot super smart"): "how many bids did I send this
// week", "which job is the oldest", "should I…". The app's quick lists answer what they show; these go to the AI with the
// facts (counting, comparing, adding up). Orders ("text the tenant", "take me…") are never this.
export function thinkingQuestion(heard: string) {
  const t = String(heard || "").toLowerCase().trim();
  if (t.split(/\s+/).length < 6) return false;
  if (/^(please )?(text|call|take me|navigate|drive|mark|make an appointment|remind|open|plan|bid \d|send|answer the notice|reply|read me|tell (claude|cloud))\b/.test(t)) return false;
  // A chain of things to do ("how did I do today and what's the weather tomorrow and read me the new bids") stays a chain.
  if (/\band (also |then )?(read me|what'?s the weather|is alternate|is it|text|call|take me|plan|open|show me|remind|tell me)\b/.test(t)) return false;
  const question = /\?\s*$/.test(t) || /^(how|why|what|which|when|where|who|should|can|could|would|will|is|are|do|does|did|have|has|tell me|explain|give me|compare)\b/.test(t);
  return question && /\b(send|sent|fax|faxed|lost|lose|average|total|compare|oldest|newest|biggest|smallest|cheapest|highest|lowest|most|least|why|should i|worth|percent|rate|since|so far|left to do|still|longest|last time|how long|say|said|wrote|email|emails|e-mail|mean|means)\b/.test(t);
}

// 🌎 A question in Spanish goes to the AI, which answers in Spanish (same check as lib/speak langOf).
function spanish(text: string) {
  const t = ` ${String(text || "").toLowerCase()} `;
  if (/[¿¡ñ]/.test(t)) return true;
  const hits = (t.match(/ (qué|que|cuántos|cuántas|cuantos|cuantas|cuándo|cuando|dónde|donde|tengo|tienes|hoy|mañana|trabajo|trabajos|el|la|los|las|por|para|está|esta|estoy|hay|mis|mi|del|una|uno|cómo|como|semana|ofertas|avisos|necesito|puedo|dime|gracias|sí|ayer|lunes|martes)(?=[ ,.?!])/g) || []).length;
  return hits >= 2 && hits / Math.max(1, t.trim().split(/\s+/).length) >= 0.2;
}

export function parseCommand(heard: string): AgentCommand {
  if (spanish(heard)) return { intent: "ask", question: String(heard).trim() };
  const t = String(heard || "").trim().toLowerCase().replace(/[.?!]+$/, "");
  const short = t.split(/\s+/).length <= 3;
  if (short && /^(yes|yeah|yep|correct|right|do it|save it|confirm|ok(ay)?|sure)\b/.test(t)) return { intent: "yes" };
  if (short && /^(no|nope|cancel|stop|wrong|never ?mind|don'?t)\b/.test(t) && !/no access/.test(t) && !/^no bid/.test(t) && !/driving|hands[- ]free/.test(t)) return { intent: "no" };
  // 🧠 Notes the chat keeps for you (3 Nov idea): "remember the super at 123 Main is in the basement".
  if (isNotesQuestion(t)) return { intent: "my-notes" };
  {
    const note = parseRemember(String(heard || "").trim().replace(/[.!?]+$/, ""));
    if (note && !/^(?:to|for) (?:claude|cloud)\b/i.test(note)) return { intent: "remember", text: note };
  }
  // Checking Claude's finished upgrade by voice (2 Nov): "it works", "looks good", "the fix works" -> 👍; "not right, the
  // button is still small", "it doesn't work, …" -> sent to Claude on that request.
  if (/^(?:(?:yes,? )?(?:it|that|this) works|(?:it'?s|that'?s) working|works (?:great|now|fine|perfect(?:ly)?)|(?:it |that |this )?looks (?:good|great)|(?:the )?(?:upgrade|update|fix|change) (?:works|is (?:good|working|great)))(?: now| great| fine| perfect(?:ly)?)?(?:,? (?:thanks|thank you)(?: claude)?)?$/.test(t)) return { intent: "claude-works" };
  {
    const m = /^(?:(?:it'?s|that'?s|it is) )?(?:not right|not working|still (?:broken|wrong|not working)|(?:it )?(?:doesn'?t|didn'?t) work)\b[,.:;]?\s*(.*)$/.exec(t);
    if (m) { const said = String(heard).trim().replace(/[.?!]+$/, ""); return { intent: "claude-not-right", text: m[1] ? said.slice(said.length - m[1].length) : "" }; }
  }
  // A change to the app itself, for Claude (27 Oct, owner: "say anything about the app and get it updated"):
  // "tell Claude to make the buttons bigger", "send to Claude: …", "I want the app to dim the other pins",
  // "can you make the map zoom smoother". The speech often hears Claude as "cloud".
  {
    const raw = String(heard || "").trim().replace(/[.!]+$/, "");
    const m = /^(?:please |hey |ok |okay )?(?:tell|ask|message|send(?: this| a message)? to|note (?:for|to)|request (?:for|to)|for) (?:claude|cloud|clod|claud|the developer|developer)\b[\s,:-]*(?:to |that |please )?(.{4,})$/i.exec(raw)
      || /^(?:upgrade|feature|change) request[\s,:-]+(.{4,})$/i.exec(raw);
    if (m) return { intent: "app-request", text: m[1].trim() };
    const ui = /\b(app|button|buttons|screen|page|card|cards|map|pill|icon|icons|zoom|zooming|colou?rs?|font|menu|helper|feature|upgrade|interface|layout|bigger|smaller|faster|smoother|animation|pins?|design|look|dim(med)?)\b/;
    if (/^(?:i want the app to|the app should|make the app)\b/.test(t)
      || (/^(?:can you |could you |please |i want (?:you )?to |i'?d like (?:you )?to |i would like (?:you )?to |let'?s |we need to |i need (?:you )?to )?(?:make|add|change|fix|remove|move|put|upgrade|improve|build|create|redesign|dim|slow down|speed up)\b/.test(t)
        && ui.test(t) && !/\b(appointments?|reminders?|paperwork|invoice|affidavit|notice|bid for|tenant)\b/.test(t))) return { intent: "app-request", text: raw };
  }
  // 📷 Read a photo (3 Nov, pick 5): the camera opens only from a tap on the phone, so this points to 📷.
  if (/^(?:can you )?(?:read|scan|take|look at|check)(?: a| this| the| my)? (?:photo|picture|pic|notice|invoice|paper|document)(?: for me)?$|^read (?:a |this |the )?photo of (?:a |this |the )?\w+$/.test(t)) return { intent: "photo" };
  // 🚗 A whole day hands-free (4 Nov): driving mode on, your day read out, then it leads step by step ("go" for the next).
  if (/\b(hands[- ]free (day|all day)|start (my|the) day hands[- ]free|lead (me through )?(my|the) day|drive me through (my|the) day|walk me through (my|the) day)\b/.test(t)) return { intent: "hands-free-day" };
  // 🚗 Driving mode (3 Nov, pick 4): short answers and it keeps listening. "I'm driving" / "I'm parked".
  if (/^(?:ok(?:ay)? )?(?:i'?m driving|i am driving|(?:turn on |start )?driving mode(?: on)?|(?:turn on )?hands[- ]free(?: mode)?(?: on)?)$/.test(t)) return { intent: "driving", on: true };
  if (/^(?:ok(?:ay)? )?(?:i'?m parked|i am parked|(?:turn off |stop |end )?driving mode(?: off)?|hands[- ]free(?: mode)? off|i'?m done driving|stop hands[- ]free)$/.test(t) && !/^(?:turn on |start )/.test(t)) return { intent: "driving", on: false };
  // Your usual price (3 Nov, pick 3 "remember my habits"): "bid the usual", "my usual price", "same as last time".
  if (/^(?:(?:bid|put|price it at|go with|use|give it|do)\s+)?(?:the usual|my usual(?: price)?|(?:the )?same (?:price )?as (?:last time|before|usual)|my last price|what i (?:usually|always) (?:bid|charge))(?: on (?:it|this(?: one)?))?$/.test(t)) return { intent: "bid-usual" };
  // 📒 The day so far (owner, 5 Nov: "these are the things I reminded you, these are things that are completed", "the
  // future work that's left to do"): "what did we do today", "what's done", "what did you remind me", "what's left".
  // 🗓 Plan my week (owner, 5 Nov: "work with the future work that's left to do").
  if (/^(?:so |ok(?:ay)? |hey )?(?:plan (?:my|the|out my|out the) week|(?:my|the) week(?:'?s)? plan|week plan|what(?:'?s| is) (?:coming up|on|ahead|planned)(?: for me)? (?:this|my|the) week|what do i have (?:this|the) week|plan the next 7 days)\??$/.test(t)) return { intent: "plan-week" };
  // ✅ Do all (owner, 5 Nov: "ask me in the app to say do all ... stick to the plan"): the next items on the plan go to
  // Claude as one request.
  if (/^(?:ok(?:ay)? |yes |so )?(?:do (?:them |it |the plan )?all|do all (?:of )?(?:them|it|the plan|three|3)|do the (?:whole )?plan|do everything on the plan|build (?:them )?all)[.!]*$/.test(t)) return { intent: "plan-do-all" };
  if (/^(?:ok(?:ay)? |hey )?(?:not today|(?:snooze|postpone)(?: it| that| them| these| all| the reminders?)?|remind me (?:about (?:it|that|them) )?tomorrow|(?:do|leave) (?:it|that) tomorrow)[.!]*$/.test(t)) return { intent: "snooze" };
  if (/^(?:so |ok(?:ay)? |hey )?(?:what (?:did|have) (?:we|i) (?:do(?:ne)?|get done|got done|finish(?:ed)?|complete(?:d)?)(?: (?:so far|today))*|what(?:'?s| is| have i| have we) (?:done|finished|completed)(?: (?:so far|today))*|(?:day )?recap|today so far|what did you remind me(?: of| about)?(?: today)?|what(?:'?s| is) (?:still )?(?:left|coming up|ahead)(?: to do)?(?: (?:today|this week|for me))?|what work is (?:still )?left|(?:the )?future work|what'?s still open)\??$/.test(t)) return { intent: "recap" };
  // While you were away (3 Nov, the owner's pick 1): "what did I miss", "catch me up", "what happened while I was out".
  if (/^(?:so |ok(?:ay)? |hey )?(?:what did i miss|what have i missed|catch me up|fill me in|what happened(?: while i was (?:away|gone|out)| today| this morning)?|did i miss anything|anything happen(?:ed)?(?: while i was (?:away|gone|out))?|while i was (?:away|gone|out))$/.test(t)) return { intent: "catch-up" };
  // What changed in the app (3 Nov, "keep upgrading"): "what's new", "what did you upgrade", "what changed in the app",
  // "latest updates", "read me the new features" -> the newest lines of What's new, read out.
  // 💡 Upgrade ideas (owner, 3 Nov: "a button I push and it recommends a bunch of suggestions, then we go from there").
  if (/^(?:ok(?:ay)? |so |hey )?(?:(?:give|show|tell) me (?:some |more |your )?(?:upgrade |new )?(?:ideas|suggestions|recommendations)(?: for (?:the )?(?:app|upgrades?))?|(?:any |some )?(?:upgrade |new )?(?:ideas|suggestions)(?: for (?:the )?(?:app|upgrades?))?|what (?:should|can|else can|else should) (?:we|i|you) (?:upgrade|add|improve|build|change)(?: next)?(?: in the app)?|(?:recommend|suggest) (?:some |more )?(?:upgrades|ideas|things|improvements)|what'?s (?:the )?next upgrade|upgrade ideas)$/.test(t)) return { intent: "ideas" };
  {
    const words: Record<string, number> = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6 };
    const m = t.match(/^(?:ok(?:ay)? |yes,? |let'?s )?(?:do|build|make|start|pick|go with|i want) (?:idea|number|suggestion|the idea|#)? ?(\d|one|two|three|four|five|six)$|^(?:ok(?:ay)? |yes,? |let'?s )?(?:do|build|make|start|pick|go with) the (first|second|third|fourth|fifth|sixth) (?:one|idea)$/);
    if (m) { const k = m[1] || m[2]; const n = Number(k) || words[k] || 0; if (n >= 1 && n <= 6) return { intent: "idea-do", n }; }
  }
  if (/^(?:give me |get |ask (?:claude )?for |i want )?more (?:upgrade )?(?:ideas|suggestions|recommendations)(?: please)?$|^(?:ask claude|tell claude) (?:to |for )?(?:give me |come up with |suggest )?(?:more |new )?(?:ideas|suggestions|upgrades)$/.test(t)) return { intent: "ideas-more" };
  if (/^(?:turn |switch )?(?:on |start )?(?:auto(?:matic)?[ -]?upgrades?|keep upgrading)(?: on| by itself| on its own)?$|^(?:turn on|start|switch on) (?:the )?(?:auto(?:matic)?[ -]?upgrades?|keep upgrading)$/.test(t)) return { intent: "auto-upgrade", on: true };
  if (/^(?:turn |switch )?(?:off |stop )(?:the )?(?:auto(?:matic)?[ -]?upgrades?|upgrading on its own|keep upgrading)$|^(?:auto(?:matic)?[ -]?upgrades?|keep upgrading) off$/.test(t)) return { intent: "auto-upgrade", on: false };
  // 🤖 Step by step (owner's picks, 4 Nov): "walk me through the job", "give me a tour", "I'm running late".
  if (/^(please )?(walk|talk|take) me through (it|the job|this job|the work|the steps)|^(read me )?(the )?(job )?step by step$|^walk me through$/.test(t)) return { intent: "walkthrough", ref: "" };
  // 💲 "is 3,200 too high?" / "what are my chances at 2500" on the open bid; 📅 "what's my week look like".
  {
    const m = /\b(?:is|would|will|if i (?:bid|put))\s+\$?\s*(\d[\d,]*)(?:\s*dollars?)?(?:\s+be)?\s+(?:too (?:high|low|much|cheap)|a good (?:price|bid)|ok(?:ay)?|good|fair|right|enough|competitive)\b/.exec(t) || /\bchances?\b.*?\$?\s*(\d[\d,]{2,})/.exec(t);
    if (m) { const price = Number(m[1].replace(/,/g, "")); if (price >= 50 && price <= 100000) return { intent: "price-check", price }; }
  }
  if (/\b(what'?s|what does|how does) my (week|next 7 days|next week) look\b|\b(my )?week ahead\b|\bnext 7 days\b|\bwhat'?s coming up( this week)?\b|\b(this|next) week'?s (schedule|plan)\b/.test(t)) return { intent: "week-ahead" };
  // 🔍 "find the job where the tenant said the dog bites" (a number or an address stays the map search).
  if (!/\d/.test(t) && /^(please )?(find|search( for)?|look for|look up)\b|^(which|what) job (had|has|was|is|where)\b|^where was the job\b/.test(t)) return { intent: "find", query: String(heard).trim() };
  // 💵 "did HPD pay me for ER07663", "was ER07663 paid", "payment on ER07663" (one job; "how much does HPD owe me" is all).
  if (/[a-z]{2}\s?\d{5}/.test(t) && /\b(pay|paid|payment|money for|check for)\b/.test(t) && !/\b(bid|price)\b/.test(t)) return { intent: "paid-check", ref: (/[a-z]{2}\s?\d{5}/.exec(t)?.[0] || "").replace(/\s/g, "").toUpperCase() };
  // 🕒 "tell the tenant I'm on my way", "on my way to ER07663", "text them I'm coming".
  // Only said as itself ("tell the tenant we'll call when we're on the way" stays your own words to the tenant).
  if (/^(i'?m |we'?re )?(on (my|our) way|coming|heading (there|over))( to [a-z]{2}\s?\d{5})?( now)?$/.test(t) || /^(tell|text|let) (the tenant|them|him|her)( know)? (that )?(i'?m|we'?re) (on (my|our) way|coming)( now)?$/.test(t)) return { intent: "on-my-way", ref: (/[a-z]{2}\s?\d{5}/.exec(t)?.[0] || "").replace(/\s/g, "").toUpperCase() };
  // 🔁 "translate", "talk to the tenant in Spanish", "interpreter" (4 Nov): both ways with the tenant.
  if (/^(open |start )?(the )?(translat(e|or|ion)|interpreter)( for (the )?tenant)?( (in|to) (spanish|chinese|mandarin|cantonese|russian))?( please)?$|\b(translate|interpret) (for|with) (the|my) tenant\b|\btalk (to|with) the tenant in (spanish|chinese|mandarin|cantonese|russian)\b|\bthe tenant (only )?speaks (spanish|chinese|mandarin|cantonese|russian)\b/.test(t)) return { intent: "translate", lang: /chinese|mandarin|cantonese/.test(t) ? "zh" : /russian/.test(t) ? "ru" : "es" };
  // ☎️ "what do I say to HPD", "HPD is calling about ER07663", "before I call HPD back" (4 Nov): the 3 things to say.
  if (/\b(what (do|should) i (say|tell)( to)? hpd|hpd('?s| is) calling|hpd called|call(ing)? hpd back|before i call hpd|talk(ing)? to hpd|what to (say|tell) (to )?hpd)\b/.test(t)) return { intent: "hpd-call", ref: (/[a-z]{2}\s?\d{5}/.exec(t)?.[0] || "").replace(/\s/g, "").toUpperCase() };
  // 📝 "HPD said they need the after photos by Friday" (5 Nov): kept on the job (named, open, or the one just asked about).
  { const m = /^(?:hpd (?:said|told me|wants|asked(?: for)?)|the hpd call:?)\s*(?:(?:about|on|for) ([a-z]{2}\s?\d{5})[,:]?\s*)?(?:that )?(.{3,})$/.exec(t); if (m) return { intent: "hpd-note", ref: (m[1] || "").replace(/\s/g, "").toUpperCase(), text: String(heard).trim().replace(/^(?:hpd (?:said|told me|wants|asked(?: for)?)|the hpd call:?)\s*(?:(?:about|on|for) [a-z]{2}\s?\d{5}[,:]?\s*)?(?:that )?/i, "") }; }
  // 🔥 "my streak", "streaks", "my records" (4 Nov).
  if (/\b(my )?streaks?\b|\bmy records?\b|\bhow many days in a row\b/.test(t)) return { intent: "streaks" };
  // 📈 "month report", "my month on one page", "last month's report".
  if (/\b(month(ly)? report|report (for|of) (the|this|last) month|month on one page|one page (report|for the month)|how was my month|(this|last) month'?s report)\b/.test(t)) return { intent: "month-report", ...(/\blast month\b/.test(t) ? { last: true } : {}) };
  // 🧾 / 🗺 / 🎉 / 📸 (owner, 4 Nov: "do all ideas").
  if (/\b(am i missing|missing (any )?paperwork|paperwork (i'?m )?missing|what paperwork (is )?(left|missing)|unfinished paperwork|paperwork (still )?(left|to do))\b/.test(t)) return { intent: "missing-paperwork" };
  if (/\b(losing time|where (does|do) (my|the) time go|what takes (the )?longest|which jobs take (the )?longest|slowest (jobs?|borough)|how long do (my )?jobs take)\b/.test(t)) return { intent: "losing-time" };
  if (/\b(good news|how did (today|my day) go|my wins today|replay (my|the) day|celebrate)\b/.test(t) && !/\b(week|month)\b/.test(t)) return { intent: "good-news" };
  if (/\bbefore (and|&|\+) after\b|\bbefore\/after\b/.test(t) && /\b(show|see|send|photos?|pictures?|pics?)\b/.test(t)) return { intent: "before-after", ref: refOf(t) };
  if (/\b(what (do|should) i (need|bring|buy|take)( today| tomorrow)?|shopping list|materials?( list)?( for today)?|what to (buy|bring))\b/.test(t)) return { intent: "materials" };
  // 🎓 "teach me the app", "how do I use the app", "show me how it works" (4 Nov).
  if (/^(please )?(teach me( the app| how to use (it|the app))?|how do i use (this|the) app|show me how (it|the app) works|show me the buttons|what do the buttons do)\??$/.test(t)) return { intent: "teach" };
  if (/^(give me a |start the |take the |show me the )?tour$|^show me around( the app)?$|^(walk me through|show me) what'?s new$/.test(t)) return { intent: "tour" };
  if (/\b(i'?m|i am|we'?re|we are) (running |going to be |gonna be )?late\b|\brunning late\b/.test(t)) return { intent: "late", ref: refOf(t.replace(/\b(running|late|gonna|going to be)\b/g, " ")) };
  if (/^(?:so |ok(?:ay)? |hey )?(?:what'?s|what is|anything) new(?: in the app| today| with the app)?$|^what (?:did|have) (?:you|claude|cloud) (?:upgrade|upgraded|change|changed|add|added|build|built|fix|fixed)(?: today| lately| in the app)?$|^what (?:changed|got upgraded)(?: in the app| today)?$|^(?:read me |tell me |show me )?(?:the )?(?:latest|newest|new) (?:updates|upgrades|features|changes)(?: in the app)?$/.test(t)) return { intent: "whats-new" };
  // What Claude is doing on your requests (owner, 2 Nov: "I need to know exactly what's going on every second"):
  // "what's Claude doing", "is Claude done", "status of my request", "how's my request going".
  if ((/\b(claude|cloud|clod|claud)\b/.test(t) && /\b(doing|working|status|progress|updates?|done|finished|ready|busy|up to|on it|where)\b/.test(t))
    || /\b(status|progress|update|updates) (of|on|for) my (change )?requests?\b|^how'?s my (change )?requests?\b|^(is|are) my (change )?requests? (done|ready|finished)\b|^my requests?$/.test(t)) return { intent: "claude-status" };
  // "Open the second one", "open number 2", "take me to the third" right after cards in the chat: that card opens
  // (2 Nov, the chat on the map). Without "open" / "go to" it still reads that job ("the second one", 23 Oct).
  {
    const m = /^(?:open|show me|go to|take me to|pick|tap|let'?s do)\s+(?:the\s+)?(?:(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)|(?:number|#|no\.?)\s*(one|two|three|four|five|[1-5])|#?([1-5]))(?:\s+(?:one|card|bid|job|notice))?$/.exec(t);
    if (m) {
      const W: Record<string, number> = { first: 1, "1st": 1, one: 1, second: 2, "2nd": 2, two: 2, third: 3, "3rd": 3, three: 3, fourth: 4, "4th": 4, four: 4, fifth: 5, "5th": 5, five: 5 };
      const w = m[1] || m[2] || m[3];
      return { intent: "open-pick", pick: W[w] || Number(w) };
    }
  }
  // The tenant confirmed the appointment (27 Oct): "the tenant confirmed", "tenant said yes for EQ15239".
  if (/\btenant\b/.test(t) && /\b(confirmed|said yes|replied yes|answered yes|texted (back )?yes|wrote yes)\b/.test(t) && !/\b(did|has|have|is|was)\b.*\?|^(did|has|is|was)\b/.test(t)) {
    const r = /\b([a-z]{2}\s?\d{5})\b/.exec(t);
    return { intent: "appt-confirmed", ref: r ? r[1].replace(/\s/g, "").toUpperCase() : "" };
  }
  // A call to the tenant, said after it (23 Oct): "I called the tenant, no answer", "called EQ15239 left a voicemail",
  // "I called the tenant, they said Thursday at 10". Noted on the job; no answer -> a reminder to call again tomorrow.
  {
    const m = /^(?:i |we )?(?:just )?(?:called|call(?:ed)? back|phoned|spoke (?:to|with)|talked (?:to|with)) (?:the )?(?:tenant|them|her|him)?(?: (?:for|at|on) )?([a-z]{2}\s?\d{5})?[,.]?\s*(?:and |but )?(.*)$/i.exec(String(heard || "").trim());
    if (m && (/\b(tenant|them|her|him)\b/i.test(String(heard)) || m[1])) {
      const rest = (m[2] || "").trim();
      const result = /\b(no answer|didn'?t (answer|pick up)|not answer|nobody answered|no one answered|no response)\b/i.test(rest) ? "no-answer" : /\b(voice ?mail|left (a )?message)\b/i.test(rest) ? "voicemail" : "talked";
      return { intent: "called", ref: (m[1] || "").replace(/\s/g, "").toUpperCase(), result, said: rest.replace(/^(they|she|he) said\s*/i, "").replace(/^(talked|spoke)( to (them|her|him))?$/i, "") };
    }
  }
  // The calling round (30 Oct): "next tenant", "call the next tenant", "start calling", "who's next to call" opens the next
  // tenant not reached yet (the same order as ▶ Start calling and ➡️ Next tenant on the card).
  if (/^(ok |okay |so )?(go to |open |call |take me to )?(the )?next (tenant|call)( to call)?( please)?$|^start calling( tenants?)?$|^who'?s next to call$|^(who|which tenant) (do i|should i) call next$/.test(t)) return { intent: "next-tenant" };
  // The chat on the map moves the map (owner, 2 Nov: "a chat on the map, better flow"): "show me the bids in Brooklyn",
  // "today's bids in Queens", "bids on the map" -> only those pins; "next bid" -> the next bid to price (map first,
  // then HPD's page); "where's my 2 PM" / "where's my next appointment" -> that job on the map.
  {
    const boro = /\b(manhattan|bronx|brooklyn|queens|staten island)\b/.exec(t);
    if (/\b(bids|invitations)\b/.test(t) && (boro || /\b(show|map|zoom|go to|take me to|open)\b/.test(t)) && !/\b(won|win|awards?|no bid|read|how many|should|price|sent)\b/.test(t)) {
      return { intent: "bids-show", boro: boro ? BORO_CODE[boro[1]] : "", day: /\btomorrow'?s?\b/.test(t) ? "1" : /\btoday'?s?\b/.test(t) ? "0" : "all" };
    }
    if (/^(ok |okay |so |now )?(go to |open |show me |take me to |do |start )?(the |my )?next (bid|invitation)( please)?$|^(start|let'?s start) (bidding|pricing|the bids)$|^let'?s (bid|price)$/.test(t)) return { intent: "next-bid" };
    // "Tomorrow's bids", "next bid tomorrow", "start tomorrow's bids" (5 Nov: tomorrow only when asked).
    if (/^(ok |okay |so |now )?(go to |open |show me |start |do |let'?s do )?(the |my )?(tomorrow'?s (bids|invitations)|next (bid|invitation) (for )?tomorrow|bids (due )?tomorrow)( please)?$/.test(t)) return { intent: "next-bid", day: "1" };
    const w = /^where(?:'?s| is) my (?:(next)(?: (?:appointment|appt|job|stop))?|(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)?)(?: (?:appointment|appt|job|one))?(?: today)?$/.exec(t);
    if (w) {
      if (w[1]) return { intent: "where-appt", at: -1 };
      const h = Number(w[2]);
      const pm = w[4] && !/o'?clock/.test(w[4]) ? /^p/.test(w[4]) : h === 12 || (h >= 1 && h <= 6);
      if (h >= 1 && h <= 12) return { intent: "where-appt", at: ((h % 12) + (pm ? 12 : 0)) * 60 + Number(w[3] || 0) };
    }
  }
  // Tenants who were texted and haven't answered (23 Oct): "which tenants haven't answered", "who do I need to call".
  if (/\b(tenants?|who)\b.{0,30}\b(haven'?t|not|didn'?t|no) (answered|replied|answer|reply|texted back|called back)\b|\b(tenants? to call|who (do|should) i (call|need to call))\b/.test(t)) return { intent: "tenants-waiting" };
  // Weather and traffic (owner, 27 Oct: "I want the AI smarter: weather, traffic"): the forecast in plain words with what
  // it means for the jobs; rush hour and live traffic in Waze.
  // "Should I do a roof job tomorrow?" (owner, 3 Nov: "it should give me an answer for everything"): a straight yes / no
  // from the forecast for outside work, then the list is offered.
  const outside = t.match(/\b(roof|roofing|outside|outdoor|exterior|paint|painting|gutters?|concrete|facade|brick|pointing|caulk|caulking|parapet|sidewalk)\b/);
  if (outside && /\b(should|shall|can|could|ok|okay|good|safe|go ahead|worth)\b/.test(t) && !/\b(bid|price|invoice|notice|text|call)\b/.test(t)) {
    const w = outside[1];
    const work = /^(outside|outdoor|exterior)$/.test(w) ? "outside" : ({ painting: "paint", roofing: "roof", caulking: "caulk", gutters: "gutter" } as Record<string, string>)[w] || w;
    return { intent: "weather", when: /\btomorrow\b/.test(t) ? "tomorrow" : "today", work };
  }
  if (!/\b(money|pay|paid|income|payments?)\b/.test(t) && /\b(weather|forecast|going to rain|gonna rain|will it rain|is it raining|rain (today|tomorrow|later)|(going to|gonna|will it) snow|snow(ing)? (today|tomorrow)|how (cold|hot) (is it|will it be)|temperature (outside|today|tomorrow)|umbrella|is it (cold|hot) outside)\b/.test(t)) return { intent: "weather", when: /\btomorrow\b/.test(t) ? "tomorrow" : "today" };
  if (/\b(traffic|rush hour|how('?s| is) the (drive|road|roads)|roads? (busy|bad|clear))\b/.test(t)) return { intent: "traffic" };
  // Parking, the building, drive time, supply runs (27 Oct, "do all of them").
  if (/\b(alternate[ -]side|a ?s ?p|street cleaning|move (my|the) (car|truck|van))\b/.test(t)) return { intent: "asp", when: /\btomorrow\b/.test(t) ? "tomorrow" : "today" };
  // 🛒 "store on my way", "stop at Home Depot on the way", "store stop" (4 Nov): the store with the fewest extra minutes.
  if (/\b(store stop|supply run on the way|(store|home depot|lowe'?s|supply|hardware)( store| house)? on (my|the) way|on (my|the) way\b.{0,25}\b(store|home depot|lowe'?s|supply|hardware)|stop at (the |a )?(home depot|lowe'?s|store|hardware store|supply)\b.{0,15}\bway)\b/.test(t)) return { intent: "store-stop" };
  const store = /\b(home depot|lowe'?s|hardware store|plumbing supply|electrical supply|supply (?:store|house)|lumber ?yard|gas station|paint store|sherwin[- ]williams|locksmith)\b/.exec(t);
  if (store && /\b(nearest|closest|near me|nearby|find|where|take me|go to|need|get to)\b/.test(t)) return { intent: "store", store: store[1] };
  if (/\b(how old is|when was .{0,20}built|year built|building (facts|info|age)|how many (floors|stories|units)|(open )?violations (on|at|in|for))\b/.test(t)) return { intent: "building", ref: refOf(t.replace(/\b(how old is|when was|built|year|building|facts|info|age|how many|floors|stories|units|violations)\b/g, " ")) };
  if (/\bhow (long|far)\b.{0,30}\b(to get|get to|drive|driving|to the|to my|from here)\b|\bhow far is\b|\bdrive time\b|\bminutes away\b/.test(t)) return { intent: "drive-time", ref: refOf(t.replace(/\b(how|long|far|will|does|it|is|take|to|get|driving|drive|time|minutes|away|from)\b/g, " ")) };
  // "What's next?" (27 Oct): the map's Next pill, read out, with a button to do it.
  if (/^(so )?(what'?s|what is) next$|^what (should|do) i do( now| next)?$|^what now$|^next (thing|step)$/.test(t)) return { intent: "whats-next" };
  // ❓ "What can you do?" / "help" (23 Oct): the examples list.
  if (/^(help|what can (you|i) (do|say|ask)|what do you do|how do i use (you|this)|what are you able to do)\b/.test(t)) return { intent: "help" };
  // Reminders for tomorrow's tenants (27 Oct): "remind tomorrow's tenants", "text the tenants for tomorrow" -> tomorrow's
  // appointments with a 📅 Text reminder button each.
  if (/\b(remind|text|message)\b/.test(t) && /\btenants\b|\btomorrow'?s tenants?\b/.test(t) && /\btomorrow'?s?\b/.test(t)) return { intent: "appointments", when: "tomorrow" };
  // Your own words to the tenant (23 Oct): "tell the tenant we'll be there at 10", "reply to the tenant for EQ15239:
  // thank you, see you Thursday", "text them that we're running late".
  {
    const m = /^(?:tell|reply to|message|text|send) (?:the tenant|tenant|them|her|him)(?: (?:for|at|on) ([a-z]{2}\s?\d{5}))?[,:]?\s+(?:that\s+)?(.{6,})$/i.exec(String(heard || "").trim());
    if (m && !/^(for|at|on) [a-z]{2}\s?\d{5}$/i.test(m[2].trim())) return { intent: "tell-tenant", ref: (m[1] || "").replace(/\s/g, "").toUpperCase(), message: m[2].trim().replace(/[.]?$/, ".") };
  }
  // Tenants' texts (23 Oct): "any texts from tenants", "did the tenant reply", "read me the tenant replies".
  if (/\b(texts?|messages?|repl(y|ies)|replied|answers?|wrote|written)\b/.test(t) && /\btenants?\b/.test(t) && /\b(any|did|read|what|new|show|from)\b/.test(t) && !/\b(haven'?t|not|didn'?t|no)\b/.test(t)) return { intent: "tenant-texts" };
  // Your appointments (23 Oct): "what appointments do I have", "appointments today / tomorrow", "my next appointment".
  if (/\bappointments?\b/.test(t) && /\b(what|which|any|my|list|read|show|when|next|today|tomorrow|have)\b/.test(t) && !/\b(make|set|book|schedule|create|add|put|cancel)\b/.test(t)) return { intent: "appointments", when: /\btomorrow\b/.test(t) ? "tomorrow" : /\btoday\b/.test(t) ? "today" : "all" };
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
  // "No bid, too far" (23 Oct): the open bid's No-bid reasons, with the one said picked out.
  { const m = /^(?:no bid|not bidding|skip (?:this|it)|pass on (?:this|it))\b[,.]?\s*(?:on (?:this|it)( one)?)?[,.]?\s*(?:because\s*)?(.*)$/.exec(t); if (m) return { intent: "no-bid", reason: m[2] || "" }; }
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
  // One job on / off Today's route (30 Oct): "add this job to my route", "put EQ15239 on today's route", "take it off my
  // route". The verbs come out before the job is read.
  {
    const routeWords = /\b(my |the |today'?s? )?(route|stops)( for today| today)?$/;
    const bare = (s: string) => refOf(s.replace(/\btoday'?s\b/g, " ").replace(/\b(add|put|remove|drop|take|off|from|onto)\b/g, " "));
    if (/\b(add|put)\b.{0,40}\b(to|on|onto)\b/.test(t) && routeWords.test(t)) return { intent: "route-add", ref: bare(t) };
    if (/\b(remove|drop|take)\b.{0,40}\b(off|from)\b/.test(t) && routeWords.test(t)) return { intent: "route-remove", ref: bare(t) };
  }
  // "Plan my day" / "build my route" (22 Oct): Today's route planned for you, then read out.
  if (/\b(plan|build|make|set up|map out)\b.{0,20}\b(my |the |today'?s? )?(day|route|stops)\b/.test(t) || /^where (should|do) i go( first| today)?\b/.test(t)) return { intent: "plan" };
  // 🗂 "Go through my notices" / "work on the notices" / "next notice" (owner, 5 Nov: "go through each and every notice in
  // detail ... take me to the notice, tell me what they're asking, what should we do now").
  if (/^(ok |okay |so |now )?(let'?s )?(go|walk|work|run|help) (me )?(through|on|with) (all |each )?(of )?(my |the )?(notices|vendor tracking)( one by one| in detail| each)?$|^(let'?s )?(do|work on|start|fix|handle|answer) (all )?(my |the )?notices( one by one| in detail)?$|^notices one by one$/.test(t)) return { intent: "notice-walk", next: false };
  if (/^(ok |okay |so )?(go to |open |show me |take me to )?(the )?next notice( please)?$/.test(t)) return { intent: "notice-walk", next: true };
  // ✅ "I already sent it" / "ER00272 is already fixed" / "this one's done" (5 Nov: "a button that says I already sent it,
  // I already fixed this notice").
  if (!/\bbids?\b/.test(t) && (/\balready (sent|answered|fixed|handled|resent|replied|did|done)\b|\b(been|was) (fixed|handled|sent|answered) already\b/.test(t) || /^(this|that|the) (one|notice)('?s| is| was| has been) (done|fixed|handled|sent|answered)$/.test(t))) return { intent: "notice-handled", ref: (/\b([a-z]{2})\s?(\d{5})\b/.exec(t) || []).slice(1).join("").toUpperCase() };
  // "Answer the notice for ER01987" / "reply to Lewis" / "reply to Gafur" (22 Oct).
  if (/\b(answer|reply|respond|write back)\b/.test(t) && /\b(notice|lewis|gafur|vendor tracking|hpd|email|request)\b/.test(t)) return { intent: "reply-notice", ref: refOf(t), who: (/\b(lewis|gafur)\b/.exec(t) || [])[1] || "" };
  // "Do the paperwork for this job" / "send the package" (22 Oct).
  if (/\b(paperwork|package|affidavit|invoice)\b/.test(t) && /\b(do|make|send|open|start|fill|prepare|generate|finish)\b/.test(t)) return { intent: "paperwork", ref: refOf(t) };
  // Doing things by voice (in-app request 22 Oct: "I should be able to talk and get everything done").
  if (/\b(text|message|sms)\b.*\b(tenant|them|her|him|resident)\b|\bsend (a |the )?(text|message|sms)\b/.test(t)) return { intent: "text-tenant", ref: refOf(t) };
  if (/\bcall\b.*\b(tenant|them|her|him|resident)\b|\b(tenant'?s?|resident'?s?) (phone|number)\b/.test(t)) return { intent: "call-tenant", ref: refOf(t) };
  // 🧭 "Take me there" / "let's go" (owner's pick, 4 Nov): straight to Waze for the job the helper just talked about.
  if (/^(ok(ay)?,? )?(let'?s go( there)?|go there|drive there|take me there|bring me there|navigate there)( now| please)?$/.test(t)) return { intent: "navigate", ref: "", next: false, there: true };
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
  // 📊 Friday check-in (4 Nov): the week, what went well, what to do better, one goal.
  if (/\b(friday (chat|check[- ]?in)|weekly check[- ]?in|week(ly)? review|check[- ]?in on my week)\b/.test(t)) return { intent: "week", friday: true };
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
  // Money forecast (3 Nov): "how much will HPD pay me this month", "money forecast", "what should I expect to get paid".
  if ((/\b(forecast|projection|projected)\b/.test(t) && /\b(money|pay|paid|income|payments?)\b/.test(t)) || (/\b(will|going to|gonna|expect|coming|should)\b/.test(t) && /\b(get paid|paid|pay me|payments?|money|make)\b/.test(t) && /\b(this month|next month|soon|coming|expect)\b/.test(t))) return { intent: "forecast" };
  // Money received (26 Oct): "how much did I get paid this month / last month / this year", "what did HPD pay me in 2025".
  if (/\b(paid|pay|payments?|received|got|made|make|earn(ed)?|income)\b/.test(t) && /\b(this|last) (month|year)\b|\b20[0-9]{2}\b/.test(t) && !/\b(owe|owed|outstanding|still)\b/.test(t)) return { intent: "paid-period", period: /last month/.test(t) ? "last-month" : /last year|\b2025\b/.test(t) ? "last-year" : /this year|\b2026\b/.test(t) ? "year" : "month" };
  // Payment rejections (24 Oct): "which rejections do I have", "what's rejected", "rejections to fix".
  if (/\b(rejections?|rejected)\b/.test(t) && !/\bfix (the )?rejection for\b/.test(t)) return { intent: "rejections" };
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
  if (/\b(i|we|i'?ve|we'?ve|job|work ?order|this|tenant|nobody|no one|someone|it)\b/.test(t) || /\bno access\b/.test(t) || /[a-z]{2}\s*\d{5}/.test(t)) for (const [re, outcome] of OUTCOMES) if (re.test(t)) return outcomeCommand(t, outcome);
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
