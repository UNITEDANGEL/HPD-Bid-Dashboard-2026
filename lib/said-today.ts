// 🗣 Say it once (owner, 5 Nov: "give me a greeting in the morning once. Don't keep reminding me, we already went
// through that... these are the things I reminded you, these are things that are completed... you don't need to keep
// telling me there are 99 jobs to do... you only need to say it once in the morning. No repetitive").
// What the helper already told you today (on this phone), so the morning brief is said once and a reminder isn't
// repeated; and the day's recap: ✅ done today, 🔔 what it reminded you of (and whether that's done now), ⏭ coming up.

export type SaidItem = { key: string; text: string; at: number };
export type DayLog = { day: string; briefAt: number; said: SaidItem[] };
export type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "hpd-said-v1";
const ls = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function readDayLog(day: string, store: Store | null = ls()): DayLog {
  try {
    const o = JSON.parse(store?.getItem(KEY) || "null");
    if (o && o.day === day) return { day, briefAt: Number(o.briefAt) || 0, said: Array.isArray(o.said) ? o.said : [] };
  } catch { /* private mode */ }
  return { day, briefAt: 0, said: [] };
}
// 🔁 One greeting across phones (owner, 5 Nov): the app sends what was said to the status server (SAID-TODAY), so the
// iPhone and the laptop don't both greet you. Called after each change.
let listener: ((log: DayLog) => void) | null = null;
export const onSaidChange = (fn: ((log: DayLog) => void) | null) => { listener = fn; };
const write = (log: DayLog, store: Store | null) => { try { store?.setItem(KEY, JSON.stringify({ ...log, said: log.said.slice(-40) })); } catch { /* private mode */ } try { listener?.(log); } catch { /* never breaks talking */ } };

export const briefDone = (day: string, store: Store | null = ls()) => readDayLog(day, store).briefAt > 0;
export function markBrief(day: string, store: Store | null = ls(), now = Date.now()) { const log = readDayLog(day, store); if (!log.briefAt) { log.briefAt = now; write(log, store); } }
export const wasSaid = (day: string, key: string, store: Store | null = ls()) => readDayLog(day, store).said.some((s) => s.key === key);
// Remember a reminder; false when it was already said today (then don't say it again).
export function noteSaid(day: string, key: string, text: string, store: Store | null = ls(), now = Date.now()) {
  const log = readDayLog(day, store);
  if (log.said.some((s) => s.key === key)) return false;
  log.said.push({ key, text: text.replace(/\s+/g, " ").trim().slice(0, 140), at: now });
  write(log, store);
  return true;
}

export type Recap = { done: string[]; reminded: { text: string; done: boolean; key?: string }[]; later: string[] };

// 😴 Snooze a reminder (owner, 5 Nov plan): "not today" takes it off today's list; it comes back in tomorrow's morning brief.
type Snoozed = { key: string; text: string; until: string };
const SKEY = "hpd-snooze-v1";
const readSnoozes = (store: Store | null): Snoozed[] => { try { const o = JSON.parse(store?.getItem(SKEY) || "[]"); return Array.isArray(o) ? o.filter((x) => x && typeof x.key === "string" && typeof x.until === "string") : []; } catch { return []; } };
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
export function snooze(day: string, key: string, text: string, store: Store | null = ls()) {
  const all = readSnoozes(store).filter((x) => x.key !== key);
  all.push({ key, text: text.replace(/\s+/g, " ").trim().slice(0, 140), until: nextDay(day) });
  try { store?.setItem(SKEY, JSON.stringify(all.slice(-40))); } catch { /* private mode */ }
}
// Still snoozed on `day` (its day hasn't come yet).
export const isSnoozed = (day: string, key: string, store: Store | null = ls()) => readSnoozes(store).some((x) => x.key === key && x.until > day);
// The ones whose day has come: tomorrow's brief says them once, then they are normal reminders again.
export function takeSnoozedBack(day: string, store: Store | null = ls()): string[] {
  const all = readSnoozes(store);
  const back = all.filter((x) => x.until <= day);
  if (back.length) { try { store?.setItem(SKEY, JSON.stringify(all.filter((x) => x.until > day))); } catch { /* private mode */ } }
  return back.map((x) => x.text);
}
// The reminders of today's log that are not snoozed.
export const withoutSnoozed = (log: DayLog, store: Store | null = ls()): DayLog => ({ ...log, said: log.said.filter((s) => !isSnoozed(log.day, s.key, store)) });
// `open` holds the keys still open right now: a reminder whose key isn't there any more got done.
export function dayRecap(log: DayLog, done: string[], open: Set<string>, later: string[]): Recap {
  return { done, reminded: log.said.map((s) => ({ text: s.text, done: !open.has(s.key), key: s.key })), later };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
// Coming back after the brief: no "Good morning" again, no counts again; what got done, what's still open of what it
// told you, then the one next thing.
export function helloAgain(name: string, r: Recap, next: string) {
  const still = r.reminded.filter((x) => !x.done).map((x) => x.text);
  const did = r.reminded.filter((x) => x.done).length;
  const parts = [`Hi again, ${name}.`];
  if (r.done.length) parts.push(`Done today: ${list(r.done.slice(0, 3))}${r.done.length > 3 ? ` and ${r.done.length - 3} more` : ""}.`);
  else if (did) parts.push(`${did} of the things I told you this morning ${did === 1 ? "is" : "are"} done.`);
  if (still.length) parts.push(`Still open from what I told you: ${still[0]}${still.length > 1 ? ` (+${still.length - 1} more)` : ""}.`);
  parts.push(next ? `Next: ${next.replace(/\.$/, "")}.` : "What's next?");
  return parts.join(" ");
}

// ➡️ It moves on by itself (owner, 5 Nov: "we already went through that, next we go to the next part"): when a part is
// finished it says so once and offers the next one. Bids, then notices, then the jobs.
export type Part = "bids" | "notices" | "jobs";
const DONE_WORDS: Record<Part, string> = { bids: "Today's bids are done.", notices: "The notices are done.", jobs: "The jobs are done for now." };
export function nextPart(done: Part, s: { bidsLeft: number; noticesToSend: number; nextStep: string }): { part: Part | ""; text: string } {
  const order: Part[] = done === "bids" ? ["notices", "jobs"] : done === "notices" ? ["bids", "jobs"] : ["notices", "bids"];
  for (const p of order) {
    if (p === "bids" && s.bidsLeft > 0) return { part: p, text: `${DONE_WORDS[done]} Bids next: ${s.bidsLeft} left today. Go?` };
    if (p === "notices" && s.noticesToSend > 0) return { part: p, text: `${DONE_WORDS[done]} Notices next: ${s.noticesToSend} to send. Go?` };
    if (p === "jobs" && s.nextStep) return { part: p, text: `${DONE_WORDS[done]} Your jobs next: ${s.nextStep.replace(/\.$/, "")}. Go?` };
  }
  return { part: "", text: `${DONE_WORDS[done]} That's everything for now. 👍` };
}
// A short yes to what it just offered ("go", "ok", "do it", "yes let's go").
export const isYes = (t: string) => /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|go|go ahead|do it|let'?s go|let'?s do it|sounds good|next|alright)(?:[ ,]+(?:please|let'?s go|go|do it|sure|ok(?:ay)?))*[.!]*$/i.test(t.trim());
// "it", "that one", "this job", "them": about what was just talked about.
export const refersBack = (t: string) => /\b(it|that|this|that one|this one|that job|this job|the same|same one|them|there)\b/i.test(t) && !/\b[a-z]{2}\s?\d{5}\b/i.test(t);
// 🗣 It waits while you're still talking (plan item 14, owner: "it waits while you're still talking instead of cutting
// you off"): the phone stops listening at a short pause; when what it heard ends like a sentence that isn't finished
// ("call the tenant for", "send the paperwork and", "um"), it keeps listening and puts the two parts together.
export const soundsUnfinished = (t: string) => {
  const s = t.trim().toLowerCase().replace(/[.,!?]+$/, "");
  if (!s) return false;
  return /\b(?:and|or|but|so|then|the|a|an|to|for|of|on|in|at|with|about|from|my|his|her|their|this|that|is|are|was|if|because|um+|uh+|uhm|also|plus|could|would|should)$/.test(s);
};

// 🚚 It hears you in the truck (plan item 20): the phone says how sure it is of the words (0-1). Unsure (wind, road
// noise) and not a command it knows = ask to say it again instead of guessing.
export const unclearHearing = (confidence: number | undefined, intent: string) =>
  typeof confidence === "number" && confidence > 0 && confidence < 0.5 && (intent === "ask" || intent === "search");

// 🗣 Out loud, a long answer is cut to its first two sentences; the rest stays on the screen.
export function shortSpeech(reply: string) {
  const one = reply.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const parts = (one.match(/.+?(?:[.!?]+(?=\s|$)|$)/g) || [one]).map((x) => x.trim()).filter(Boolean);
  if (one.length <= 300 || parts.length <= 3) return one;
  return `${parts.slice(0, 2).join(" ")} The rest is on the screen.`;
}

// What goes to the status server: keys and our own short words only. A job or a step becomes just its job number
// (a step can name the tenant; no tenant data on the server).
const OMO = /\b[A-Z]{2}\d{5}\b/;
export function forServer(log: DayLog): DayLog {
  const said: SaidItem[] = [];
  for (const s of log.said) {
    const [kind] = s.key.split(":");
    if (["bids", "notice", "part", "wrap"].includes(kind)) said.push({ key: s.key.slice(0, 60), text: s.text.slice(0, 80), at: s.at });
    else if (kind === "job" || kind === "first") { const o = OMO.exec(s.key); if (o) said.push({ key: `${kind}:${o[0]}`, text: kind === "job" ? `pick up where you left off on ${o[0]}` : `next: ${o[0]}`, at: s.at }); }
  }
  return { day: log.day, briefAt: log.briefAt, said: said.slice(-40) };
}
// Another phone's log for the same day joins this one: the earliest brief, every reminder once. true = something new.
export function mergeDayLog(remote: unknown, store: Store | null = ls()): boolean {
  const r = remote as Partial<DayLog> | null;
  if (!r || typeof r.day !== "string") return false;
  const log = readDayLog(r.day, store);
  if (log.day !== r.day) return false;
  let changed = false;
  const rb = Number(r.briefAt) || 0;
  if (rb && (!log.briefAt || rb < log.briefAt)) { log.briefAt = rb; changed = true; }
  for (const s of Array.isArray(r.said) ? r.said : []) {
    if (!s || typeof s.key !== "string" || log.said.some((x) => x.key === s.key || (s.key.startsWith("first:") && x.key.startsWith("first:") && x.key.includes(s.key.slice(6))))) continue;
    log.said.push({ key: s.key, text: String(s.text || "").slice(0, 140), at: Number(s.at) || 0 });
    changed = true;
  }
  if (changed) { try { store?.setItem(KEY, JSON.stringify({ ...log, said: log.said.slice(-40) })); } catch { /* private mode */ } }
  return changed;
}

// 📋 A message board, not repeats (owner, 6 Nov: "I don't want my AI helper feeding me over and over, we already went
// through this once. It's just a message board, whatever we discussed, wherever we are, and we keep moving forward
// through the day"). "Hi again" says only what changed since the last time it talked to you: new things done, new
// things still open, the next step if it's new. Nothing new: one short line. The whole board stays on the screen.
export type HiSnap = { day: string; at: number; done: string[]; still: string[]; next: string };
export function helloSince(name: string, r: Recap, next: string, prev: HiSnap | null, day: string, now = Date.now()): { text: string; snap: HiSnap } {
  const done = r.done.slice(), still = r.reminded.filter((x) => !x.done).map((x) => x.text);
  const snap: HiSnap = { day, at: now, done, still, next };
  if (!prev || prev.day !== day) return { text: helloAgain(name, r, next), snap };
  const newDone = done.filter((x) => !prev.done.includes(x));
  const newStill = still.filter((x) => !prev.still.includes(x));
  const parts = [`Hi again, ${name}.`];
  if (newDone.length) parts.push(`Since we talked: ${list(newDone.slice(0, 3))} done${newDone.length > 3 ? ` (+${newDone.length - 3} more)` : ""}.`);
  if (newStill.length) parts.push(`New: ${newStill[0]}${newStill.length > 1 ? ` (+${newStill.length - 1} more)` : ""}.`);
  const nextNew = next && next !== prev.next;
  if (nextNew) parts.push(`Next: ${next.replace(/\.$/, "")}.`);
  if (parts.length === 1) {
    const t = new Date(prev.at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
    parts.push(`Nothing new since ${t}.${next ? " Same next step, it's on the board." : ""}`);
  }
  return { text: parts.join(" "), snap };
}
