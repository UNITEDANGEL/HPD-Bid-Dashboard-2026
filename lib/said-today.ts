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
const write = (log: DayLog, store: Store | null) => { try { store?.setItem(KEY, JSON.stringify({ ...log, said: log.said.slice(-40) })); } catch { /* private mode */ } };

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

export type Recap = { done: string[]; reminded: { text: string; done: boolean }[]; later: string[] };
// `open` holds the keys still open right now: a reminder whose key isn't there any more got done.
export function dayRecap(log: DayLog, done: string[], open: Set<string>, later: string[]): Recap {
  return { done, reminded: log.said.map((s) => ({ text: s.text, done: !open.has(s.key) })), later };
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
// 🗣 Out loud, a long answer is cut to its first two sentences; the rest stays on the screen.
export function shortSpeech(reply: string) {
  const one = reply.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const parts = (one.match(/.+?(?:[.!?]+(?=\s|$)|$)/g) || [one]).map((x) => x.trim()).filter(Boolean);
  if (one.length <= 300 || parts.length <= 3) return one;
  return `${parts.slice(0, 2).join(" ")} The rest is on the screen.`;
}
