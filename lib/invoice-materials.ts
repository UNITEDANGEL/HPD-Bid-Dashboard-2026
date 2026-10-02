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

// Quantities are not multiplied: 1 of each item (hinges as 1 SET), unless the scope states a count
// such as "REPLACE 2NOS ... SPRING".
type Rule = { test: RegExp; name: string; qty?: string; skipIf?: RegExp; countFrom?: RegExp };

// Order is the order they print.
const RULES: Rule[] = [
  { test: /\bHINGES?\b/, name: "SELF CLOSING HINGES", qty: "1 SET", skipIf: /HEAVY DUTY HINGE|BUTT HINGE/ },
  { test: /HEAVY DUTY HINGE|BUTT HINGE/, name: "HEAVY DUTY HINGES", qty: "1 SET" },
  { test: /DOOR CLOSER|ARM CLOSER|\bCLOSER\b/, name: "DOOR CLOSER" },
  { test: /MORTISE/, name: "MORTISE LOCKSET" },
  { test: /PUSH PADDLE|PANIC BAR|PANIC DEVICE/, name: "PUSH PADDLE / PANIC BAR" },
  { test: /ADAM ?RITE/, name: "ADAM RITE LOCK" },
  { test: /PASSA ?GE ?(?:LOCK|SET|LATCH)/, name: "PASSAGE LOCK" },
  { test: /LOCKSET|LOCK SET|LATCH ?SET|\bLOCK\b/, name: "LOCKSET", skipIf: /MORTISE|ADAM ?RITE|PASSA ?GE ?(?:LOCK|SET|LATCH)/ },
  { test: /CYLINDER/, name: "LOCK CYLINDER" },
  { test: /STRIKE/, name: "STRIKE PLATE" },
  { test: /SADDLE|THRESHOLD/, name: "DOOR SADDLE" },
  { test: /DOOR SWEEP/, name: "DOOR SWEEP" },
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

export function materialsFromScope(scope: string): InvoiceMaterial[] {
  const text = String(scope || "").toUpperCase();
  const found: InvoiceMaterial[] = [];
  for (const rule of RULES) {
    if (!rule.test.test(text) || (rule.skipIf && rule.skipIf.test(text))) continue;
    const stated = rule.countFrom ? Number(text.match(rule.countFrom)?.[1] || 0) : 0;
    found.push({ name: rule.name, qty: stated > 0 ? String(stated) : rule.qty || "1" });
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
      // Quantity first, optionally with a unit: "1 DOOR CLOSER", "1 SET SELF CLOSING HINGES".
      const match = line.match(/^(\d+(?:\.\d+)?(?:\s*(?:SETS?|PCS?|BOX(?:ES)?|ROLLS?|GAL)\b)?)\s*[xX]?\s+(.+)$/i);
      return match ? { qty: match[1].toUpperCase(), name: match[2].trim().toUpperCase() } : { qty: "", name: line.toUpperCase() };
    })
    .slice(0, INVOICE_MATERIAL_ROWS);
}
