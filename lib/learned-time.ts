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

