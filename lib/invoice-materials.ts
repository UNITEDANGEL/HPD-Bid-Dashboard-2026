// Invoice material list built from the job's scope of work.
// The invoice has 12 material rows and says quantities must be filled in.

export type InvoiceMaterial = { name: string; qty: string };

export const INVOICE_MATERIAL_ROWS = 12;

// Used on every job where work was done.
const BASIC_MATERIALS: InvoiceMaterial[] = [
  { name: "TRASH BAGS", qty: "1" },
  { name: "WD-40", qty: "1" },
  { name: "DISPOSABLE RAGS", qty: "1" },
  { name: "SCREWS", qty: "1" },
];

// countFrom reads a stated count such as "REPLACE 2NOS ... SPRING".
type Rule = { test: RegExp; name: string; perDoor?: number; skipIf?: RegExp; countFrom?: RegExp };

// Order is the order they print. perDoor multiplies by the door count in the scope.
const RULES: Rule[] = [
  { test: /\bHINGES?\b/, name: "SELF CLOSING HINGES", perDoor: 3, skipIf: /HEAVY DUTY HINGE|BUTT HINGE/ },
  { test: /HEAVY DUTY HINGE|BUTT HINGE/, name: "HEAVY DUTY HINGES", perDoor: 3 },
  { test: /DOOR CLOSER|ARM CLOSER|\bCLOSER\b/, name: "DOOR CLOSER", perDoor: 1 },
  { test: /MORTISE/, name: "MORTISE LOCKSET", perDoor: 1 },
  { test: /PUSH PADDLE|PANIC BAR|PANIC DEVICE/, name: "PUSH PADDLE / PANIC BAR", perDoor: 1 },
  { test: /ADAM ?RITE/, name: "ADAM RITE LOCK", perDoor: 1 },
  { test: /LOCKSET|LOCK SET|LATCH ?SET|PASSAGE LOCK|\bLOCK\b/, name: "LOCKSET", perDoor: 1, skipIf: /MORTISE|ADAM ?RITE/ },
  { test: /CYLINDER/, name: "LOCK CYLINDER", perDoor: 1 },
  { test: /STRIKE/, name: "STRIKE PLATE", perDoor: 1 },
  { test: /SADDLE|THRESHOLD/, name: "DOOR SADDLE", perDoor: 1 },
  { test: /DOOR SWEEP/, name: "DOOR SWEEP", perDoor: 1 },
  { test: /SPRING BALANCE/, name: "SPRING BALANCE", countFrom: /(\d+)\s*NOS?\b[^.]*SPRING/ },
  { test: /\bSASH\b/, name: "SASH HARDWARE" },
  { test: /\bGLASS\b|GLAZ/, name: "GLASS / GLAZING COMPOUND" },
  { test: /PLASTER|SPACKLE|JOINT COMPOUND/, name: "PLASTER / JOINT COMPOUND" },
  { test: /SHEETROCK|DRYWALL|GYPSUM/, name: "SHEETROCK" },
  { test: /\bPAINT/, name: "PAINT" },
  { test: /WOOD FLOOR|FLOORING|FLOOR ?BOARD/, name: "WOOD FLOORING" },
  { test: /\bTILES?\b/, name: "TILES / ADHESIVE" },
  { test: /\bLEAK|\bPIPE|VALVE|FAUCET|\bDRAIN/, name: "PLUMBING FITTINGS / TEFLON TAPE" },
  { test: /CAULK/, name: "CAULKING" },
];

const WORD_NUMBERS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6 };

// "TOTAL DOORS = 2", "TOTAL NOS OF DOOR= (1)", "TOTAL DOORS: TWO"
export function doorCount(scope: string) {
  const match = scope.toUpperCase().match(/TOTAL\s+(?:NOS?\.?\s+OF\s+)?DOORS?\s*[=:]?\s*\(?\s*(\d+|ONE|TWO|THREE|FOUR|FIVE|SIX)\b/);
  if (!match) return 1;
  const value = WORD_NUMBERS[match[1]] ?? Number(match[1]);
  return value > 0 && value < 20 ? value : 1;
}

export function materialsFromScope(scope: string): InvoiceMaterial[] {
  const text = String(scope || "").toUpperCase();
  const doors = doorCount(text);
  const found: InvoiceMaterial[] = [];
  for (const rule of RULES) {
    if (!rule.test.test(text) || (rule.skipIf && rule.skipIf.test(text))) continue;
    const stated = rule.countFrom ? Number(text.match(rule.countFrom)?.[1] || 0) : 0;
    found.push({ name: rule.name, qty: String(stated > 0 ? stated : rule.perDoor ? rule.perDoor * doors : 1) });
  }
  return found;
}

// Full invoice list for a work package: basics, then what the scope calls for.
export function invoiceMaterials(scope: string): InvoiceMaterial[] {
  const specific = materialsFromScope(scope);
  const rows = [...BASIC_MATERIALS, ...specific];
  if (/\bDOOR/i.test(scope)) rows.push({ name: "ADJUST AND ALIGN DOOR", qty: "1" });
  return rows.slice(0, INVOICE_MATERIAL_ROWS);
}

// Editable text form: one material per line as "QTY ITEM".
export function materialsToText(rows: InvoiceMaterial[]) {
  return rows.map((row) => `${row.qty} ${row.name}`).join("\n");
}

export function materialsFromText(text: string): InvoiceMaterial[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+(?:\.\d+)?)\s*[xX]?\s+(.+)$/);
      return match ? { qty: match[1], name: match[2].trim().toUpperCase() } : { qty: "", name: line.toUpperCase() };
    })
    .slice(0, INVOICE_MATERIAL_ROWS);
}
