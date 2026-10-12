const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require); return m.exports; };
const { priceHelp, readScope } = load('lib/bid-price.ts');
const fill = load('lib/bid-fill.ts');

const history = [
  { id: 'D1', description: 'REPLACE HOPPER CHUTE DOOR LATCH AT 3RD STORY', amount: 380 },
  { id: 'D2', description: 'REPAIR HOPPER CHUTE DOOR AND LATCH', amount: 400 },
  { id: 'D3', description: 'HOPPER DOOR LATCH SET REPLACE', amount: 420 },
  { id: 'D4', description: 'AEP ALTERNATIVE ENFORCEMENT PROGRAM WATER LEAK CEILING PLASTER PAINT', amount: 1800 },
  { id: 'D5', description: 'AEP ALTERNATIVE ENFORCEMENT PROGRAM BULKHEAD DOOR CLOSER', amount: 500 },
  { id: 'D6', description: 'TRACE WATER LEAK REPAIR CEILING PLASTER AND PAINT BATHROOM', amount: 2200 },
  { id: 'D0', description: 'HOPPER LATCH', amount: 0 },
];
// Hopper latch work matches the hopper jobs; the $0 one is ignored.
const hopper = priceHelp('REPLACE 3RD STY HOPPER LATCH SET AT PUBLIC HALL HOPPER CHUTE DOOR', history);
assert.deepEqual(hopper.examples.map((e) => e.id).sort(), ['D1', 'D2', 'D3']);
assert.equal(hopper.middle, 400);
assert.ok(hopper.low <= hopper.middle && hopper.middle <= hopper.high);
// "AEP" is a program label, not the kind of work: a leak job matches leak jobs, not the AEP door job.
const leak = priceHelp('AEP AT APT 2J REPAIR WATER LEAKS AND DAMAGED CEILING PLASTER', history);
assert.deepEqual(leak.examples.map((e) => e.id).sort(), ['D4', 'D6']);
assert.equal(priceHelp('', history), null);
assert.equal(priceHelp('ROOF DRAIN', history), null, 'nothing similar: no made-up range');

// Reading the whole description: kinds of work, counts and areas, and the traps found in real invitations.
const closerLock = readScope('AT BUILDING ENTRANCE DOOR: INSTALL NEW DOOR CLOSER AND REPLACE BROKEN MORTISE LOCK. ENSURE DOOR IS SELF CLOSING AND LATCHING. TOTAL DOORS = (1)');
assert.deepEqual(closerLock.items, ['closer', 'lock']);
assert.equal(closerLock.doors, 1);
assert.equal(readScope('INSTALL NEW PASSAGE LOCKS ON 6 FIRE DOORS. TOTAL DOORS= (6)').doors, 6);
assert.equal(readScope('ADJUST DOORS. TOTAL NOS OF DOOR = (19) REMOVE ALL WORK RELATED DEBRIS.').doors, 19);
assert.equal(readScope('MAKE DOOR SELF CLOSING ( 2 DOORS IN TOTAL )').doors, 2);
const aep = readScope('AEP - ALTERNATIVE ENFORCEMENT PROGRAM APT 1K. TRACE, LOCATE AND REPAIR WATER LEAKS. PROVIDE AND INSTALL APPROX. 25 SQ.FT. 5/8 THICK GWB AT CEILING. SCRAPE, TAPE, PLASTER AND APPLY ONE COAT OF PRIMER AND TWO COATS OF SEMI-GLASS PAINT TO THE ENTIRE CEILING, APPROX 140 SF. IN THE BATHROOM INSTALL APPROX.32 SQ. FT. OF GWB. PRIME AND APPLY 2 COATS OF PAINT TO ENTIRE CEILING AND WALLS APPROX. 130 SQ. FT.');
assert.deepEqual(aep.items, ['leak', 'sheetrock', 'paint'], '"Enforcement" is not cement, "semi-glass paint" is not window glass');
assert.equal(aep.repairSqft, 57, 'sheetrock in both rooms added up');
assert.equal(aep.paintSqft, 270, 'paint in both rooms added up');
assert.equal(readScope('REMOVE 36 SQ.FT. OF CEILING. INSTALL NEW GWB 36 SQ.FT.').repairSqft, 36, 'remove/install of the same area counts once');
assert.equal(readScope('1) TRACE THE LEAK. 2) REPLACE SHEETROCK 40 SQFT. 3) PAINT THE CEILING 96 SQFT.').tasks, 3);
assert.deepEqual(readScope('REPLACE GLASS AT LOWER WINDOW AT LIVING ROOM').items, ['glass'], 'replacing glass is not a new window');
assert.deepEqual(readScope('CRACKED GLASS AT FIRE ESCAPE UPPER WINDOW SASH').items, ['glass'], 'a fire escape window is a place, not fire escape work');
assert.deepEqual(readScope('INSTALL NEW HINGES TO MAKE DOOR SELF-CLOSING').items, ['hinges'], 'new hinges is not a new door');
assert.deepEqual(readScope('TRACE THE WATER LEAK FROM THE PLUMBING FIXTURES ABOVE').items, ['leak', 'plumbing'], 'plumbing fixtures are not electrical');
assert.match(aep.summary, /~57 sq ft repair area · ~270 sq ft to paint/);

// A closer + lock job is priced against closer + lock jobs, not single-closer ones; sizes are adjusted.
const doors = [
  { id: 'C1', description: 'INSTALL NEW DOOR CLOSER. TOTAL DOORS = (1)', amount: 450 },
  { id: 'C2', description: 'INSTALL NEW DOOR CLOSER AT ENTRANCE DOOR. TOTAL DOORS = (1)', amount: 470 },
  { id: 'C3', description: 'REPLACE DOOR CLOSER. TOTAL DOORS = (1)', amount: 460 },
  { id: 'L1', description: 'INSTALL NEW DOOR CLOSER AND NEW MORTISE LOCK. TOTAL DOORS = (1)', amount: 850 },
  { id: 'L2', description: 'REPLACE DOOR CLOSER AND PASSAGE LOCK. TOTAL DOORS = (1)', amount: 890 },
  { id: 'L3', description: 'NEW CLOSER AND NEW LOCK CYLINDER AT DOOR. TOTAL DOORS = (1)', amount: 900 },
];
const both = priceHelp('BULKHEAD DOOR: INSTALL NEW DOOR CLOSER AND REPLACE BROKEN LOCK. TOTAL DOORS = (1)', doors);
assert.deepEqual(both.examples.map((e) => e.id).sort(), ['L1', 'L2', 'L3']);
assert.ok(both.middle >= 850, `closer + lock priced like closer + lock jobs (${both.middle})`);
assert.match(both.why, /same kind of work/);
const twoDoors = priceHelp('INSTALL NEW DOOR CLOSER. TOTAL DOORS = (2)', doors);
assert.ok(twoDoors.middle > 600 && twoDoors.middle < 940, `2 doors cost more than 1, less than double (${twoDoors.middle})`);
assert.match(twoDoors.why, /adjusted/);
const mixed = priceHelp('INSTALL NEW DOOR CLOSER AND REPAIR FIRE ESCAPE DROP LADDER. TOTAL DOORS = (1)', doors);
assert.deepEqual(mixed.unmatched, ['fire escape'], 'work with no history is called out');
assert.equal(mixed.confidence, 'low');

// Bid package text helpers.
assert.equal(fill.bidPriceText(1250), '1,250.00');
assert.equal(fill.bidDateText('2026-10-07'), '10/7/26');
assert.equal(fill.bidDescription('NYC HPD EMERGENCY OPERATIONS DIVISION – “ESSENTIAL SERVICE WORK“ AT DOOR: INSTALL CLOSER. CONTRACTOR MUST CONTACT HPD @ 212'), 'AT DOOR: INSTALL CLOSER. REMOVE ALL WORK RELATED DEBRIS.');
console.log('PASS bid price help: reads the whole description (work items, doors, windows, repair and paint sq ft, tasks), matches the same mix of work, adjusts for size, flags work with no history; bid package text');
