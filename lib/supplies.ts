// Supplies for tomorrow (owner idea, 14 Nov 2026): one list of what to bring, built from the work description
// of each job on tomorrow's list. Plain keyword rules; nothing is sent anywhere, no tenant data is used.

type Rule = { re: RegExp; items: string[] };
const RULES: Rule[] = [
  { re: /\b(hinge|hinges|door|doors|lock|latch|strike)\b/i, items: ["Hinges and screws", "Drill and bits", "Door lock / latch set"] },
  { re: /\b(leak|leaks|leaking|pipe|pipes|faucet|sink|drain|toilet|trap|valve)\b/i, items: ["Pipe wrench", "Plumber's tape and putty", "Washers, trap and valve parts", "Bucket and rags"] },
  { re: /\b(plaster|ceiling|wall|walls|crack|cracks|hole|holes|sheetrock|drywall)\b/i, items: ["Plaster / joint compound", "Putty knives", "Drywall patch and tape", "Sandpaper"] },
  { re: /\b(paint|painting|peeling|stain|stains|mold|mildew)\b/i, items: ["Primer and paint", "Brushes and rollers", "Drop cloth and tape", "Mold cleaner and mask"] },
  { re: /\b(window|windows|glass|sash|screen)\b/i, items: ["Glazing / window parts", "Caulk and caulk gun", "Window screen kit"] },
  { re: /\b(outlet|outlets|switch|electric|electrical|light|lights|wire|wiring|fixture)\b/i, items: ["Outlets / switches", "Wire nuts and tape", "Voltage tester"] },
  { re: /\b(floor|floors|tile|tiles|linoleum|vct)\b/i, items: ["Floor tile / adhesive", "Utility knife", "Trowel"] },
  { re: /\b(roach|roaches|mice|mouse|rodent|rodents|vermin|pest)\b/i, items: ["Gloves", "Steel wool and sealant for holes"] },
];
const ALWAYS = ["Gloves", "Ladder", "Camera / phone charged", "Trash bags"];

export type SupplyRow = { id: string; address: string; work?: string };
export type SupplyList = { jobs: number; items: string[]; unknown: string[] };

export function suppliesFor(rows: SupplyRow[]): SupplyList {
  const items = new Set<string>();
  const unknown: string[] = [];
  for (const r of rows) {
    const work = String(r.work || "").replace(/\s+/g, " ");
    let hit = false;
    for (const rule of RULES) if (rule.re.test(work)) { hit = true; for (const i of rule.items) items.add(i); }
    if (!hit) unknown.push(r.id);
  }
  if (rows.length) for (const i of ALWAYS) items.add(i);
  return { jobs: rows.length, items: [...items], unknown };
}
