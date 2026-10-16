// The owner's own minimum price per kind of work ("my cost floor"): the best price the app suggests never goes
// below it, and a price typed under it gets a note. Set on the phone (kept on this device, never published);
// no minimum set = the app's best price as before.
import { bestPrice, readScope, winChance, type PriceHelp } from "./bid-price";

export type Floors = Record<string, number>;
const KEY = "hpd-cost-floors";

// Kind of work a minimum applies to: the job's main kind (same label the bid screen shows first).
export const floorKind = (description: string) => readScope(description || "").labels[0] || "general repair";

export function readFloors(): Floors {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "number" && v > 0)) as Floors;
  } catch {
    return {};
  }
}

export function saveFloor(kind: string, amount: number | null): Floors {
  const next = { ...readFloors() };
  if (amount && amount > 0) next[kind] = Math.round(amount);
  else delete next[kind];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts this visit */ }
  return next;
}

// The best price, raised to the minimum when the minimum is higher (with that price's own chance to win).
export function bestWithFloor(help: Pick<PriceHelp, "prices" | "toWin">, floor: number | undefined) {
  const best = bestPrice(help);
  if (!floor || best.price >= floor) return { ...best, floored: false, appBest: best.price };
  const chance = winChance(help, floor);
  return { price: floor, chance, expected: Math.round(floor * chance), floored: true, appBest: best.price };
}
