// 🗺 The route that learns (idea list, 3 Nov: "remembers how long each building really takes and plans the day with
// it"). Every visit timed by the app (⏱ "I'm here" to the saved outcome, lib/job-time) teaches it: a stop at a building
// you've been to before gets the time it took there; otherwise your usual time for that kind of work (3+ timed jobs);
// otherwise the route's "Minutes per job". Nothing new is kept: it's worked out from the jobs' own visit times.

export const WORK_KINDS: [string, RegExp][] = [
  ["lead", /\blead\b|delead|xrf|abat/i],
  ["mold", /\bmou?ld\b/i],
  ["door / lock", /door|lock|buzzer|intercom|hinge|closer|peephole/i],
  ["window", /window|glass|guard|sash/i],
  ["plumbing", /leak|pipe|plumb|toilet|sink|faucet|drain|water|tub|shower|radiator|valve/i],
  ["electric", /electric|outlet|wiring|light|smoke detector|carbon monoxide|fixture/i],
  ["ceiling / wall", /ceiling|plaster|wall|paint/i],
  ["floor", /floor|tile/i],
  ["rubbish", /rubbish|debris|garbage|clean[\s-]?out/i],
  ["pests", /pest|extermin|rodent|roach|bed\s?bug|mice/i],
];

export function kindOfWork(text: string) {
  const t = String(text || "");
  return WORK_KINDS.find(([, re]) => re.test(t))?.[0] || "other";
}

export type TimedVisit = { building: string; kind: string; minutes: number };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// To the nearest 5 minutes, 15 to 240 (what the route's minutes allow).
const roundStay = (n: number) => Math.min(240, Math.max(15, Math.round(n / 5) * 5));

export function learnedMinutes(job: { building: string; kind: string }, timed: TimedVisit[]): { minutes: number; why: string } | null {
  const here = timed.filter((t) => t.building && t.building === job.building).map((t) => t.minutes);
  if (here.length) return { minutes: roundStay(median(here)), why: `${here.length === 1 ? "your last visit" : `${here.length} visits`} at this building` };
  if (job.kind !== "other") {
    const same = timed.filter((t) => t.kind === job.kind).map((t) => t.minutes);
    if (same.length >= 3) return { minutes: roundStay(median(same)), why: `your usual for ${job.kind} work (${same.length} jobs)` };
  }
  return null;
}

// ⏱ How long each kind of work takes (app idea list): "how long does a door job take?" / "how long does each kind of
// work take?", from the visits the app timed (⏱ I'm here -> the saved outcome). For planning the day and pricing bids.
const minLabel = (n: number) => { const r = Math.round(n / 5) * 5; return r >= 60 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ""}` : `${Math.max(5, r)} min`; };
export function kindTimes(timed: TimedVisit[]) {
  const by = new Map<string, number[]>();
  for (const t of timed) if (t.kind && t.kind !== "other") by.set(t.kind, [...(by.get(t.kind) || []), t.minutes]);
  return [...by.entries()].map(([kind, xs]) => ({ kind, n: xs.length, mid: median(xs), low: Math.min(...xs), high: Math.max(...xs) })).sort((a, b) => b.n - a.n);
}
export function kindTimeAnswer(kind: string | null, timed: TimedVisit[]) {
  const all = kindTimes(timed);
  if (kind && kind !== "other") {
    const k = all.find((x) => x.kind === kind);
    if (!k) return `I haven't timed a ${kind} job yet. Tap ⏱ I'm here when you get there and save how it went: I'll learn how long ${kind} work takes you.`;
    const range = k.n > 1 && k.high - k.low >= 10 ? ` (from ${minLabel(k.low)} to ${minLabel(k.high)})` : "";
    return `⏱ ${kind[0].toUpperCase()}${kind.slice(1)} work takes you about ${minLabel(k.mid)}: the middle of ${k.n} timed job${k.n === 1 ? "" : "s"}${range}.${k.n < 3 ? " A few more timed jobs and it gets surer." : ""}`;
  }
  if (!all.length) return "No job has been timed yet. Tap ⏱ I'm here when you get to a job and save how it went: I'll learn how long each kind of work takes you.";
  return `⏱ How long your work takes (the middle of your timed jobs):\n${all.slice(0, 8).map((k) => `• ${k.kind}: ${minLabel(k.mid)} (${k.n} job${k.n === 1 ? "" : "s"})`).join("\n")}`;
}
