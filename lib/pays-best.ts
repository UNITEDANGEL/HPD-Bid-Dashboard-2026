// Which work pays best (plan, 20 Nov 2026): past HPD jobs grouped by kind of work (doors, plaster and paint,
// plumbing...) with money per job and per work day, best per day first. HPD gives no hours on site, so a
// "work day" is each day from work start to work completion (same day = 1). Numbers only, no tenant data.

export type Kind = { kind: string; icon: string; jobs: number; total: number; perJob: number; perDay: number };

// First match wins, so the more specific kinds come first.
export const KINDS: { kind: string; icon: string; re: RegExp }[] = [
  { kind: "Smoke / CO detectors", icon: "🚨", re: /SMOKE|CARBON MONOXIDE|\bC\.?O\.? DETECTOR/ },
  { kind: "Mold", icon: "🧽", re: /\bMOU?LD\b/ },
  { kind: "Pests", icon: "🐀", re: /EXTERMINAT|ROACH|\bMICE\b|RODENT|BED ?BUG|VERMIN/ },
  { kind: "Plumbing", icon: "🚰", re: /PLUMB|LEAK|\bPIPES?\b|FAUCET|TOILET|\bSINK|DRAIN|SHOWER|BATHTUB|\bTUB\b/ },
  { kind: "Heat / boiler", icon: "🔥", re: /BOILER|RADIATOR|\bHEAT/ },
  { kind: "Electric", icon: "💡", re: /ELECTRIC|OUTLET|WIRING|LIGHT FIXTURE|RECEPTACLE/ },
  { kind: "Windows", icon: "🪟", re: /WINDOW/ },
  { kind: "Doors / locks", icon: "🚪", re: /\bDOORS?\b|\bLOCKS?\b|HINGE|CLOSER/ },
  { kind: "Floors / tile", icon: "🧱", re: /FLOOR|\bTILES?\b/ },
  { kind: "Plaster / paint", icon: "🎨", re: /PLASTER|PAINT|CEILING|\bWALLS?\b/ },
];

export function kindOf(description: string): { kind: string; icon: string } {
  const d = String(description || "").toUpperCase();
  const k = KINDS.find((x) => x.re.test(d));
  return k ? { kind: k.kind, icon: k.icon } : { kind: "Other", icon: "🛠️" };
}

// "1/5/26" or ISO -> UTC day number.
const dayNum = (v: string): number | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(String(v || ""));
  const iso = m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : String(v || "").slice(0, 10);
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86400000) : null;
};

export function workDays(start: string, end: string): number {
  const a = dayNum(start), b = dayNum(end);
  if (a == null || b == null || b < a || b - a > 60) return 1; // missing or odd dates count as one day
  return b - a + 1;
}

export function paysBest(jobs: { OMO?: string; JobDescription?: string; AwardAmount?: string | number; WorkStartDate?: string; WorkCompletionDate?: string }[] | null | undefined, minJobs = 2): Kind[] {
  const by = new Map<string, { icon: string; jobs: number; total: number; days: number }>();
  for (const j of jobs || []) {
    if (String(j.OMO || "").toUpperCase() === "TEST-0001") continue;
    const amount = Number(String(j.AwardAmount ?? "").replace(/[$,]/g, ""));
    if (!(amount > 0)) continue;
    const { kind, icon } = kindOf(String(j.JobDescription || ""));
    const g = by.get(kind) || { icon, jobs: 0, total: 0, days: 0 };
    g.jobs += 1; g.total += amount; g.days += workDays(String(j.WorkStartDate || ""), String(j.WorkCompletionDate || ""));
    by.set(kind, g);
  }
  return [...by.entries()]
    .filter(([, g]) => g.jobs >= minJobs)
    .map(([kind, g]) => ({ kind, icon: g.icon, jobs: g.jobs, total: Math.round(g.total), perJob: Math.round(g.total / g.jobs), perDay: Math.round(g.total / g.days) }))
    .sort((a, b) => b.perDay - a.perDay || b.total - a.total);
}
