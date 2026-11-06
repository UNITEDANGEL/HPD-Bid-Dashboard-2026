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
