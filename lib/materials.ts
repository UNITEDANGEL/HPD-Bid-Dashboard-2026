// 📦 What to bring today (owner's pick, 4 Nov): the materials the day's jobs need, from HPD's work descriptions, with
// how many jobs need each and which ones.
const ITEMS: [RegExp, string][] = [
  [/\b(paint|painting|repaint)\b/i, "🎨 Paint, rollers, brushes"],
  [/\b(plaster|skim|patch|spackle|joint compound|sheetrock|drywall|gypsum)\b/i, "🧱 Plaster / joint compound / drywall"],
  [/\b(tile|tiles|grout)\b/i, "🔲 Tile and grout"],
  [/\b(caulk|caulking|sealant)\b/i, "🧴 Caulk"],
  [/\b(smoke detector|smoke alarm|carbon monoxide|co detector|co alarm)\b/i, "🚨 Smoke / CO detectors"],
  [/\b(window guard|window guards)\b/i, "🪟 Window guards"],
  [/\b(window|sash|pane|glass)\b/i, "🪟 Window parts / glass"],
  [/\b(door|doors|knob|hinge|lock|locks|cylinder|deadbolt)\b/i, "🚪 Door hardware / locks"],
  [/\b(outlet|receptacle|switch|electric|electrical|light fixture|wiring)\b/i, "🔌 Electrical (outlets, covers, fixtures)"],
  [/\b(faucet|sink|toilet|leak|leaking|pipe|plumbing|drain|trap|shower|tub|bathtub|water)\b/i, "🔧 Plumbing parts"],
  [/\b(mold|mould|mildew)\b/i, "🧽 Mold cleaner and mask"],
  [/\b(floor|flooring|vinyl|linoleum|vct|tiles? floor)\b/i, "🟫 Flooring"],
  [/\b(radiator|heat|heating|steam|boiler)\b/i, "♨️ Heating parts"],
  [/\b(roach|roaches|mice|mouse|rodent|vermin|pest|bed ?bugs?)\b/i, "🪤 Pest control"],
  [/\b(roof|roofing|gutter|leader)\b/i, "🏠 Roofing"],
  [/\b(cabinet|counter|countertop)\b/i, "🗄 Cabinet / counter parts"],
];

export type MaterialLine = { item: string; jobs: string[] };

export function materialsFor(jobs: { id: string; text: string }[]): MaterialLine[] {
  const out = new Map<string, string[]>();
  for (const j of jobs) {
    let text = String(j.text || "");
    // "window guard" shouldn't also count as window parts.
    for (const [re, item] of ITEMS) {
      if (!re.test(text)) continue;
      out.set(item, [...(out.get(item) || []), j.id]);
      if (item.startsWith("🪟 Window guards")) text = text.replace(/\bwindow guards?\b/gi, " ");
    }
  }
  return [...out.entries()].map(([item, ids]) => ({ item, jobs: [...new Set(ids)] })).sort((a, b) => b.jobs.length - a.jobs.length);
}
