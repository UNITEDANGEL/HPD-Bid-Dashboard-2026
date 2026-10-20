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

// The map picture (owner, 20 Oct: "make the icons better"): a bold white drawing on a disc in the job's own color, easy
// to tell apart on an iPhone (emoji were small and blurry). Shapes on a 24 x 24 box; class "f" = filled.
export const JOB_GLYPHS: Record<string, { color: string; svg: string }> = {
  water: { color: "#0369a1", svg: '<path d="M12 2.5c3.6 4.6 6.3 7.9 6.3 11a6.3 6.3 0 0 1-12.6 0c0-3.1 2.7-6.4 6.3-11z" class="f"/>' },
  pipe: { color: "#0e7490", svg: '<path d="M3 9.5h10a3.5 3.5 0 0 1 3.5 3.5v1.5"/><path d="M7.5 9.5V6.5h4v3"/><path d="M5.5 6.5h8"/><path d="M16.5 18v.5M16.5 21v.5"/>' },
  heat: { color: "#c2410c", svg: '<path d="M12 2.5c1.2 3.2 4.8 5 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.3 1.1-3.6 2.3-4.6 0 2.2 1 3.3 2.2 3.3 0-3.5-1.2-5.6.3-8.7z" class="f"/>' },
  power: { color: "#a16207", svg: '<path d="M13.5 2 5 13.5h6.2L10 22l8.8-12h-6.3z" class="f"/>' },
  alarm: { color: "#be123c", svg: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" class="f"/><path d="M12 1.8v1.4M12 20.8v1.4"/>' },
  bell: { color: "#a16207", svg: '<path d="M5.5 16.5V11a6.5 6.5 0 0 1 13 0v5.5l2 2h-17z" class="f"/><path d="M9.8 20.5a2.3 2.3 0 0 0 4.4 0"/>' },
  door: { color: "#92400e", svg: '<path d="M6.5 21V3.5h11V21"/><path d="M3 21h18"/><circle cx="14.6" cy="12.6" r="1.4" class="f"/>' },
  lock: { color: "#6d28d9", svg: '<rect x="4.8" y="10" width="14.4" height="11.5" rx="2.2" class="f"/><path d="M8 10V7.2a4 4 0 0 1 8 0V10"/>' },
  hinge: { color: "#7e22ce", svg: '<rect x="3.5" y="3.5" width="6.5" height="17" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="17" rx="1.2"/><path d="M10 7.5h4M10 12h4M10 16.5h4"/>' },
  window: { color: "#0891b2", svg: '<rect x="4" y="3" width="16" height="18" rx="1.6"/><path d="M12 3v18M4 12h16"/>' },
  paint: { color: "#be185d", svg: '<rect x="2.8" y="3.5" width="15" height="6.5" rx="1.6" class="f"/><path d="M17.8 6.8h2.4v5.4H12v3"/><rect x="10.4" y="15" width="3.2" height="6.5" rx="1" class="f"/>' },
  wall: { color: "#57534e", svg: '<rect x="3" y="4.5" width="18" height="15" rx="1.2"/><path d="M3 9.5h18M3 14.5h18M9 4.5v5M15 9.5v5M9 14.5v5"/>' },
  floor: { color: "#854d0e", svg: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/><path d="M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4"/>' },
  roof: { color: "#334155", svg: '<path d="M2.5 11.5 12 4l9.5 7.5"/><path d="M5.5 10v10.5h13V10"/><path d="M10 20.5v-5h4v5"/>' },
  ladder: { color: "#334155", svg: '<path d="M7.5 2.5v19M16.5 2.5v19M7.5 7h9M7.5 12h9M7.5 17h9"/>' },
  mold: { color: "#15803d", svg: '<circle cx="8" cy="8.5" r="3.2" class="f"/><circle cx="16.3" cy="7.5" r="2.1" class="f"/><circle cx="14.5" cy="15.8" r="3.8" class="f"/><circle cx="6.8" cy="17" r="1.8" class="f"/>' },
  trash: { color: "#4b5563", svg: '<path d="M4.5 6.5h15M9 6.5V3.5h6v3M6.5 6.5l1.2 15h8.6l1.2-15"/><path d="M10 10.5v7M14 10.5v7"/>' },
  metal: { color: "#1e3a8a", svg: '<path d="M3 6.5h18M5 6.5v14M10 6.5v14M14 6.5v14M19 6.5v14"/>' },
  cabinet: { color: "#78350f", svg: '<rect x="4" y="3" width="16" height="18" rx="1.6"/><path d="M12 3v18M9.8 12h-1.2M15.4 12h-1.2"/>' },
  block: { color: "#c2410c", svg: '<path d="M10 3h4l4.5 16.5h-13z" class="f"/><path d="M3.5 21h17"/>' },
  shield: { color: "#1e40af", svg: '<path d="M12 2.5 19.5 5.6v6c0 4.4-3.2 7.8-7.5 9.9-4.3-2.1-7.5-5.5-7.5-9.9v-6z" class="f"/>' },
  clip: { color: "#0f766e", svg: '<rect x="4.8" y="4" width="14.4" height="17.5" rx="2"/><path d="M9 3h6v3.2H9zM8.5 11h7M8.5 15h7"/>' },
  repair: { color: "#1e293b", svg: '<path d="M14.6 3.5a4.8 4.8 0 0 0-4.5 6.4L3.5 16.5l4 4 6.6-6.6a4.8 4.8 0 0 0 6.4-4.5l-3 3-3.6-3.6 3-3a4.8 4.8 0 0 0-2.3-.3z" class="f"/>' },
};
const KEY_GROUP: Record<string, string> = { "leak": "water", "heat": "heat", "mold": "mold", "plumbing": "pipe", "electric": "power", "detector": "alarm", "roof": "roof", "fire-escape": "ladder", "window-new": "window", "glass": "window", "window-hardware": "window", "hinges": "hinge", "secure-tech": "lock", "electric-strike": "lock", "entrance-lock": "lock", "lock": "lock", "door-new": "door", "closer": "door", "ada-closer": "door", "door-adjust": "door", "pushbar": "door", "intercom": "bell", "hopper-chute": "trash", "compactor-hydraulic": "trash", "paint": "paint", "sheetrock": "wall", "ceiling": "wall", "wall": "wall", "floor": "floor", "masonry": "wall", "metal": "metal", "cabinet": "cabinet", "obstruction": "block", "seal": "shield", "lead": "mold", "aep": "clip" };

// The drawing as SVG markup (for map pins and list rows).
export function jobGlyphSvg(group: string, size = 26) {
  const g = JOB_GLYPHS[group] || JOB_GLYPHS.repair;
  return `<svg class="fc-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${g.svg.replace(/ class="f"/g, ' fill="#fff" stroke="none"')}</svg>`;
}

export function jobIcon(description: string): { icon: string; label: string; more: number; group: string; color: string } {
  const items = readScope(description || "").items;
  const hit = ICONS.find(([k]) => items.includes(k));
  const group = hit ? KEY_GROUP[hit[0]] || "repair" : "repair";
  const color = (JOB_GLYPHS[group] || JOB_GLYPHS.repair).color;
  return hit ? { icon: hit[1], label: hit[2], more: Math.max(0, items.length - 1), group, color } : { icon: "🛠️", label: "Repair", more: 0, group, color };
}
