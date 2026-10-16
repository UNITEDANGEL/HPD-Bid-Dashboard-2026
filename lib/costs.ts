// Your costs (owner, 16 Oct 2026): what each kind of work costs you in materials and labor, per the same unit
// the price uses (per door, per sq ft, each, per job), plus a trip cost per job. The bid calculator subtracts them
// to show your profit and % at your price and at the market's best price. Kept on this phone, never published.
// Starting numbers are the owner's own: hollow metal door ~$500, hopper door ~$300, hinges ~$15 each, door closer
// ~$30, Secure Tech lock ~$1,000+, electric strike ~$150. Everything else starts empty for the owner to fill in.

export type CostEntry = { material: number; labor: number };
export type Costs = Record<string, CostEntry> & { trip?: CostEntry };
export type CostItem = { key: string; label: string; unit: string; note?: string };

const KEY = "hpd-my-costs-v1";

// Kinds of work, the unit their cost is counted in (same as the price), and the owner's starting numbers.
export const COST_ITEMS: CostItem[] = [
  { key: "door-new", label: "New door (hollow metal)", unit: "per door", note: "hopper door ~$300" },
  { key: "hinges", label: "Hinges", unit: "per door", note: "3 hinges x ~$15" },
  { key: "closer", label: "Door closer", unit: "per door" },
  { key: "lock", label: "Lock / latch", unit: "per door" },
  { key: "entrance-lock", label: "Entrance lock (Adams Rite / mortise)", unit: "per door" },
  { key: "secure-tech", label: "Secure Tech lock", unit: "each" },
  { key: "electric-strike", label: "Electric strike", unit: "each" },
  { key: "intercom", label: "Buzzer / intercom", unit: "per job" },
  { key: "pushbar", label: "Push bar / panic bar", unit: "per door" },
  { key: "door-adjust", label: "Door adjust (self-close & latch)", unit: "per door" },
  { key: "glass", label: "Window glass", unit: "per window" },
  { key: "window-hardware", label: "Window balance / sash / guard", unit: "per window" },
  { key: "floor", label: "Floor / tile", unit: "per sq ft" },
  { key: "sheetrock", label: "Sheetrock / plaster", unit: "per sq ft" },
  { key: "paint", label: "Painting", unit: "per sq ft" },
  { key: "leak", label: "Trace & repair leak", unit: "per job" },
  { key: "plumbing", label: "Plumbing", unit: "per job" },
  { key: "trip", label: "Trip (gas, tolls, parking)", unit: "per job" },
];

export const DEFAULT_COSTS: Costs = {
  "door-new": { material: 500, labor: 0 },
  hinges: { material: 45, labor: 0 },
  closer: { material: 30, labor: 0 },
  "secure-tech": { material: 1000, labor: 0 },
  "electric-strike": { material: 150, labor: 0 },
};

export function readCosts(): Costs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_COSTS };
    const parsed = JSON.parse(raw) as Costs;
    return parsed && typeof parsed === "object" ? parsed : { ...DEFAULT_COSTS };
  } catch {
    return { ...DEFAULT_COSTS };
  }
}

export function saveCost(key: string, entry: CostEntry | null): Costs {
  const next: Costs = { ...readCosts() };
  if (entry && (entry.material > 0 || entry.labor > 0)) next[key] = { material: Math.max(0, Math.round(entry.material * 100) / 100), labor: Math.max(0, Math.round(entry.labor * 100) / 100) };
  else delete next[key];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts this visit */ }
  return next;
}

// Cost of a job: each line's (material + labor) x its quantity (per-job lines once), plus the trip.
// Lines with no cost set are listed so the owner knows the profit is missing them.
export function jobCost(lines: { key: string; qty: number; unit: string }[], costs: Costs) {
  let material = 0, labor = 0;
  const missing: string[] = [];
  for (const l of lines) {
    if (l.key.startsWith("x-")) continue; // extras (floors, locations, travel) are price, not cost
    const c = costs[l.key];
    if (!c) { missing.push(l.key); continue; }
    const qty = /per job/.test(l.unit) ? 1 : Math.max(1, l.qty || 1);
    material += c.material * qty;
    labor += c.labor * qty;
  }
  const trip = costs.trip ? costs.trip.material + costs.trip.labor : 0;
  const total = Math.round(material + labor + trip);
  return { material: Math.round(material), labor: Math.round(labor), trip: Math.round(trip), total, missing };
}

// Profit and % (of the price) at a price.
export const profitAt = (price: number, cost: number) => ({ profit: Math.round(price - cost), pct: price > 0 ? Math.round(((price - cost) / price) * 100) : 0 });
