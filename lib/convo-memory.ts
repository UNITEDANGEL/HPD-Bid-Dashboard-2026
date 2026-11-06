// 🧠 It remembers our conversation (owner, 5 Nov night: "he needs to be more understanding and keep track of our
// conversation when we talked about"; plan item 15). Today's talk, both sides, kept on this phone only (never sent):
// "what did we talk about", "what did I say about Main Street", "what did you say before", "the job before".

export type Turn = { at: number; heard: string; reply: string; jobs: string[] };
export type ConvoLog = { day: string; turns: Turn[] };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "hpd-convo-v1";
const MAX = 30;
const ls = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const OMO = /\b[A-Z]{2}\s?\d{5}\b/g;
export const jobsIn = (t: string) => [...new Set((String(t || "").toUpperCase().match(OMO) || []).map((x) => x.replace(/\s/, "")))];

export function readConvo(day: string, store: Store | null = ls()): ConvoLog {
  try {
    const o = JSON.parse(store?.getItem(KEY) || "null");
    if (o && o.day === day && Array.isArray(o.turns)) return { day, turns: o.turns };
  } catch { /* private mode */ }
  return { day, turns: [] };
}
// One turn (what you said, what it answered). The same answer twice in a row is kept once.
export function addTurn(day: string, heard: string, reply: string, store: Store | null = ls(), now = Date.now()) {
  const h = String(heard || "").replace(/\s+/g, " ").trim();
  const r = String(reply || "").replace(/\s+/g, " ").trim();
  if (!h || !r || /^[\p{Extended_Pictographic}\s]+$/u.test(h)) return false; // the 👋 / 🎤 openers aren't talk
  const log = readConvo(day, store);
  const last = log.turns[log.turns.length - 1];
  if (last && last.heard === h && last.reply === r.slice(0, 400)) return false;
  log.turns.push({ at: now, heard: h.slice(0, 200), reply: r.slice(0, 400), jobs: jobsIn(`${h} ${r}`).slice(0, 4) });
  try { store?.setItem(KEY, JSON.stringify({ day, turns: log.turns.slice(-MAX) })); } catch { /* private mode */ }
  return true;
}

const time = (t: number) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const first = (r: string) => (r.match(/^.+?[.!?](?=\s|$)/) || [r])[0].replace(/^[\p{Extended_Pictographic}️\s]+/u, "").slice(0, 120);
const STOP = new Set(["the", "a", "an", "about", "on", "of", "for", "to", "my", "me", "i", "you", "we", "it", "that", "this", "job", "what", "did", "say", "said"]);

// The topics of today's talk: the jobs, newest first, and the last few questions.
export function talkedAbout(log: ConvoLog) {
  const jobs: string[] = [];
  for (const t of [...log.turns].reverse()) for (const j of t.jobs) if (!jobs.includes(j)) jobs.push(j);
  return { jobs, asks: [...log.turns].reverse().slice(0, 5).map((t) => t.heard) };
}
// "What did we talk about": a short list.
export function summary(log: ConvoLog) {
  if (!log.turns.length) return "We haven't talked yet today.";
  const { jobs, asks } = talkedAbout(log);
  return `Today we talked ${log.turns.length} time${log.turns.length === 1 ? "" : "s"}${jobs.length ? `, about ${jobs.slice(0, 5).join(", ")}` : ""}. Last you asked: ${asks.slice(0, 3).map((a) => `"${a}"`).join(", ")}.`;
}
// "What did I say about Main Street": the turns that name it (words or a job number), newest first.
export function recall(log: ConvoLog, about: string) {
  const job = jobsIn(about)[0];
  const words = about.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  const hits = [...log.turns].reverse().filter((t) => {
    if (job) return t.jobs.includes(job);
    const text = `${t.heard} ${t.reply}`.toLowerCase();
    return words.length > 0 && words.every((w) => text.includes(w));
  });
  if (!hits.length) return `I don't have anything about ${about} from today.`;
  return hits.slice(0, 3).map((t) => `At ${time(t.at)} you said "${t.heard}" and I said: ${first(t.reply)}`).join(" ");
}
// "What did you say before": the answer before the last one.
export function lastAnswer(log: ConvoLog, back = 1) {
  const t = log.turns[log.turns.length - back];
  return t ? `At ${time(t.at)}, when you said "${t.heard}", I said: ${t.reply}` : "I haven't said anything yet today.";
}
// "The job before": the job talked about before the newest one.
export function jobBefore(log: ConvoLog) {
  const { jobs } = talkedAbout(log);
  return jobs[1] || "";
}

// 🧠 It remembers yesterday (plan item 25): what you said you'd do ("I'll call the tenant after lunch") is kept by day;
// the next morning brief asks about the ones from before today, once.
export type Promise1 = { day: string; what: string };
const PKEY = "hpd-promises-v1";
const readPromises = (store: Store | null): Promise1[] => { try { const a = JSON.parse(store?.getItem(PKEY) || "[]"); return Array.isArray(a) ? a.filter((x) => x && typeof x.what === "string" && typeof x.day === "string") : []; } catch { return []; } };
export function notePromise(day: string, what: string, store: Store | null = ls()) {
  const w = String(what || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!w) return;
  const all = readPromises(store).filter((x) => !(x.day === day && x.what === w));
  all.push({ day, what: w });
  try { store?.setItem(PKEY, JSON.stringify(all.slice(-20))); } catch { /* private mode */ }
}
// The ones from before today (up to 3 days back), taken once.
export function takeEarlierPromises(today: string, store: Store | null = ls()): Promise1[] {
  const all = readPromises(store);
  const back = new Date(Date.parse(`${today}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
  const due = all.filter((x) => x.day < today && x.day >= back);
  const keep = all.filter((x) => x.day >= today);
  if (keep.length !== all.length) { try { store?.setItem(PKEY, JSON.stringify(keep)); } catch { /* private mode */ } }
  return due;
}
export function promisesLine(due: Promise1[], today: string) {
  if (!due.length) return "";
  const y = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const when = due.every((x) => x.day === y) ? "Yesterday" : "Earlier";
  return `${when} you said you'd ${due.slice(0, 3).map((x) => x.what).join("; ")}${due.length > 3 ? ` (+${due.length - 3} more)` : ""}. Did that get done?`;
}
