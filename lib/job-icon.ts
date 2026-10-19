// A picture for the kind of job (owner, 19 Oct: "show icon of what type of job, like hinges... or a leak job"), from the
// job description: the most telling item wins (a leak over the painting that follows it).

import { readScope } from "./bid-price";

// Most specific first.
const ICONS: [string, string, string][] = [
  ["leak", "💧", "Leak"],
  ["heat", "🔥", "Heat / radiator"],
  ["mold", "🦠", "Mold"],
  ["plumbing", "🚰", "Plumbing"],
  ["electric", "⚡", "Electrical"],
  ["detector", "🚨", "Smoke / CO detector"],
  ["roof", "🏠", "Roof"],
  ["fire-escape", "🪜", "Fire escape"],
  ["window-new", "🪟", "New window"],
  ["glass", "🪟", "Window glass"],
  ["window-hardware", "🪟", "Window hardware"],
  ["hinges", "🔩", "Hinges"],
  ["secure-tech", "🔐", "Secure Tech lock"],
  ["electric-strike", "🔐", "Electric strike"],
  ["entrance-lock", "🔐", "Entrance lock"],
  ["lock", "🔒", "Lock / latch"],
  ["door-new", "🚪", "New door"],
  ["closer", "🚪", "Door closer"],
  ["ada-closer", "♿", "ADA door closer"],
  ["door-adjust", "🚪", "Door adjust"],
  ["pushbar", "🚪", "Push bar"],
  ["intercom", "🔔", "Buzzer / intercom"],
  ["hopper-chute", "🗑️", "Hopper chute"],
  ["compactor-hydraulic", "🗜️", "Compactor"],
  ["paint", "🎨", "Painting"],
  ["sheetrock", "🧱", "Sheetrock / plaster"],
  ["ceiling", "🧱", "Ceiling"],
  ["wall", "🧱", "Walls"],
  ["floor", "🟫", "Floor / tile"],
  ["masonry", "🧱", "Masonry"],
  ["metal", "🔧", "Railing / metal"],
  ["cabinet", "🗄️", "Cabinets"],
  ["obstruction", "🚧", "Remove obstruction"],
  ["seal", "🛡️", "Seal / board up"],
  ["lead", "☣️", "Lead abatement"],
  ["aep", "📋", "AEP"],
];

export function jobIcon(description: string): { icon: string; label: string; more: number } {
  const items = readScope(description || "").items;
  const hit = ICONS.find(([k]) => items.includes(k));
  return hit ? { icon: hit[1], label: hit[2], more: Math.max(0, items.length - 1) } : { icon: "🛠️", label: "Repair", more: 0 };
}
