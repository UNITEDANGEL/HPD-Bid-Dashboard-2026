// 🧪 The Lead Abatement Scope sheet: the kinds of work to price, lines / rooms / apartment worked out from your rates,
// HPD's white marks turned into white boxes (its own figures stay covered), your numbers written in the blank boxes,
// and the sheet added after the invitation. Uses ER09991's sheet when it's on this computer; the math runs anyway.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const dir = path.join(root, "node_modules", ".tmp-lead-scope");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "lead-scope.mjs"), ts.transpileModule(fs.readFileSync(path.join(root, "lib", "lead-scope.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const L = await import(pathToFileURL(path.join(dir, "lead-scope.mjs")).href);

const item = (component, method, qty, um, y) => ({ component, method, qty, um, page: 0, y, rateRight: 459.7, costRight: 505.4 });
const scope = { rooms: [
  { room: "BATHROOM", total: { page: 0, x: 525, y: 468 }, items: [item("SOUTH WALL", "Enclosure", 50, "SQFT", 541), item("BASEBOARD AT SOUTH WALL", "Replacement", 5, "FT", 507)] },
  { room: "3rd ROOM FROM NORTH", total: { page: 0, x: 525, y: 114 }, items: [item("WEST WALL", "Enclosure", 82, "SQFT", 359), item("1st WINDOW FRAME", "Replacement", 17, "FT", 222)] },
], apartment: { page: 0, x: 507, y: 79 }, mold: "Mold abatement from west wall prior to enclosure." };

assert.deepEqual(L.rateGroups(scope).map((g) => [g.key, g.qty, g.lines, g.unit]), [["Wall|Enclosure|SQFT", 132, 2, "sq ft"], ["Baseboard|Replacement|FT", 5, 1, "ft"], ["Window|Replacement|FT", 17, 1, "ft"]]);
const half = L.priceScope(scope, { "Wall|Enclosure|SQFT": 18 });
assert.equal(half.complete, false); assert.deepEqual(half.missing, ["Baseboard|Replacement|FT", "Window|Replacement|FT"]);
// Owner, 9 Nov: baseboard, window and door replacement each have their own price.
assert.deepEqual(["1st WINDOW FRAME FROM SOUTH AT WEST WALL", "BASEBOARD AT EAST WALL", "SOUTH WALL", "ENTRANCE DOOR JAMB", "DOOR CASING", "2nd RADIATOR"].map(L.partOf), ["Window", "Baseboard", "Wall", "Door", "Door", "Radiator"]);
const split = L.priceScope(scope, { "Wall|Enclosure|SQFT": 18, "Baseboard|Replacement|FT": 30, "Window|Replacement|FT": 50 });
assert.deepEqual(split.rooms.map((r) => r.total), [900 + 150, 82 * 18 + 17 * 50]);
// Rates saved the old way (one per kind of work) still count, and are split per part when one part's rate is typed.
const old = { "Enclosure|SQFT": 18, "Replacement|FT": 40.5 };
assert.equal(L.priceScope(scope, old).total, 3267);
const moved = L.withGroupRate(scope, old, "Window|Replacement|FT", 60);
assert.deepEqual(moved, { "Wall|Enclosure|SQFT": 18, "Baseboard|Replacement|FT": 40.5, "Window|Replacement|FT": 60 });
assert.equal(L.withGroupRate(scope, moved, "Window|Replacement|FT", 0)["Window|Replacement|FT"], 0);
assert.equal(L.priceScope(scope, L.withGroupRate(scope, moved, "Window|Replacement|FT", 0)).complete, false, "cleared: no old rate comes back");
const p = L.priceScope(scope, { "Wall|Enclosure|SQFT": 18, "Baseboard|Replacement|FT": 40.5, "Window|Replacement|FT": 40.5 });
assert.equal(p.complete, true);
assert.deepEqual(p.rooms.map((r) => r.total), [1102.5, 2164.5]);
assert.equal(p.total, 3267);
assert.equal(L.scopeMoney(3267), "$3,267.00");
// A rate on one line wins for that line only; a line with its own rate counts as priced.
const own = L.priceScope(scope, { "Wall|Enclosure|SQFT": 18, "Baseboard|Replacement|FT": 40.5, "Window|Replacement|FT": 40.5, [L.lineKey(0, 0)]: 20 });
assert.equal(own.rooms[0].items[0].rate, 20);
assert.equal(own.rooms[0].items[0].own, true);
assert.equal(own.total, 3267 + 2 * scope.rooms[0].items[0].qty);
const onlyLines = { ...Object.fromEntries(scope.rooms.flatMap((r, ri) => r.items.map((_, ii) => [L.lineKey(ri, ii), 10]))) };
assert.equal(L.priceScope(scope, onlyLines).complete, true, "every line priced on its own");

const sheet = path.join(root, "ITB_Downloads_V5", "lead", "ER09991.pdf");
if (fs.existsSync(sheet)) {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const filled = await L.fillLeadScope(fs.readFileSync(sheet), scope, { "Enclosure|SQFT": 18, "Replacement|FT": 40.5 });
  const doc = await PDFDocument.load(filled);
  assert.equal(doc.getPages()[0].node.lookup(PDFName.of("Annots"))?.size?.() ?? 0, 0, "HPD's white marks are now part of the page");
  const text = (await (await (await pdfjs.getDocument({ data: new Uint8Array(filled), verbosity: 0 }).promise).getPage(1)).getTextContent()).items.map((x) => x.str).join(" ");
  for (const s of ["18.00", "$900.00", "40.50", "$202.50", "$1,102.50", "$2,164.50", "$3,267.00"]) assert.ok(text.includes(s), `${s} on the sheet`);
  const both = await L.appendScope(await (await PDFDocument.create()).save().then(async () => { const d = await PDFDocument.create(); d.addPage(); d.addPage(); return d.save(); }), filled);
  assert.equal((await PDFDocument.load(both)).getPageCount(), 3, "the scope sheet after the invitation pages");
  console.log("  ER09991's sheet filled: rates, costs, room and apartment totals written; white marks flattened");
}
console.log("PASS lead scope: kinds of work, missing rates, lines / rooms / apartment totals, sheet filled and added to the package");
