const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require); return m.exports; };
const { priceHelp, readScope, winChance, bestPrice } = load('lib/bid-price.ts');
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
// A lead job is priced against lead jobs, not regular paint jobs.
const leadHist = [
  { id: 'P1', description: 'SCRAPE AND PAINT WINDOW SILL AND WALLS', amount: 900 },
  { id: 'P2', description: 'SCRAPE AND REPAINT WALLS IN BEDROOM', amount: 950 },
  { id: 'P3', description: 'PAINT WALLS AND WINDOW SILL', amount: 920 },
  { id: 'L1', description: 'LEAD BASED PAINT HAZARD: SCRAPE AND PAINT WINDOW SILL USING LEAD SAFE WORK PRACTICES', amount: 2500 },
  { id: 'L2', description: 'LEAD ABATEMENT: SCRAPE AND REPAINT WALLS, LEAD DUST WIPE TEST', amount: 2600 },
  { id: 'L3', description: 'DELEAD WINDOW SILL AND PAINT. XRF REQUIRED', amount: 2450 },
];
const leadJob = priceHelp('LEAD BASED PAINT: SCRAPE AND PAINT WALLS AND WINDOW SILL, LEAD SAFE PRACTICES', leadHist);
assert.deepEqual(leadJob.examples.map((e) => e.id).sort(), ['L1', 'L2', 'L3'], 'lead priced against lead jobs');
assert.ok(leadJob.middle >= 2400, `lead middle ${leadJob.middle}`);
const leak = priceHelp('AEP AT APT 2J REPAIR WATER LEAKS AND DAMAGED CEILING PLASTER', history);
assert.deepEqual(leak.examples.map((e) => e.id).sort(), ['D4', 'D6']);
assert.equal(priceHelp('', history), null);
assert.equal(priceHelp('ROOF DRAIN', history), null, 'nothing similar: no made-up range');

// Reading the whole description: kinds of work, counts and areas, and the traps found in real invitations.
const closerLock = readScope('AT BUILDING ENTRANCE DOOR: INSTALL NEW DOOR CLOSER AND REPLACE BROKEN MORTISE LOCK. ENSURE DOOR IS SELF CLOSING AND LATCHING. TOTAL DOORS = (1)');
assert.deepEqual(closerLock.items, ['closer', 'entrance-lock'], 'a mortise lock at the entrance is entrance hardware');
assert.deepEqual(readScope('INSTALL NEW DOOR CLOSER AND NEW PASSAGE LOCK. TOTAL DOORS = (1)').items, ['closer', 'lock']);
assert.deepEqual(readScope('MAKE ALL NECESSARY REPAIRS TO BUILDING ENTRANCE DOOR SECURE-TECH LOCK AND BUZZER SYSTEM. TOTAL DOORS= (1)').items, ['secure-tech', 'intercom'], 'ER05994: Secure Tech lock and the buzzer, each its own work');
assert.deepEqual(readScope('INSTALL A NEW ADAMS RITE LOCK KEEPING THE EXISTING CYLINDER AND A NEW ELECTRIC STRIKE PLATE. TOTAL DOORS= (1)').items, ['electric-strike', 'entrance-lock'], 'Adams Rite + electric strike');
assert.deepEqual(readScope('REPLACE BROKEN/DEFECTIVE HOPPER DOOR WITH NEW PROPERLY FIRE RATED HOPPER DOOR, COMPLETE WITH SELF-CLOSING HINGES, LATCH. TOTAL DOORS= (1)').items, ['door-new', 'hinges'], 'a new fire-rated hopper door (its latch is part of the door)');
assert.equal(closerLock.doors, 1);
assert.equal(readScope('INSTALL NEW PASSAGE LOCKS ON 6 FIRE DOORS. TOTAL DOORS= (6)').doors, 6);
assert.equal(readScope('ADJUST DOORS. TOTAL NOS OF DOOR = (19) REMOVE ALL WORK RELATED DEBRIS.').doors, 19);
assert.equal(readScope('MAKE DOOR SELF CLOSING ( 2 DOORS IN TOTAL )').doors, 2);
const aep = readScope('AEP - ALTERNATIVE ENFORCEMENT PROGRAM APT 1K. TRACE, LOCATE AND REPAIR WATER LEAKS. PROVIDE AND INSTALL APPROX. 25 SQ.FT. 5/8 THICK GWB AT CEILING. SCRAPE, TAPE, PLASTER AND APPLY ONE COAT OF PRIMER AND TWO COATS OF SEMI-GLASS PAINT TO THE ENTIRE CEILING, APPROX 140 SF. IN THE BATHROOM INSTALL APPROX.32 SQ. FT. OF GWB. PRIME AND APPLY 2 COATS OF PAINT TO ENTIRE CEILING AND WALLS APPROX. 130 SQ. FT.');
assert.deepEqual(aep.items, ['aep', 'leak', 'sheetrock', 'paint'], 'AEP is its own unit; "Enforcement" is not cement, "semi-glass paint" is not window glass');
assert.deepEqual(readScope('LEAD BASED PAINT HAZARD: SCRAPE AND REPAINT WINDOW SILL USING LEAD SAFE WORK PRACTICES. XRF TESTING REQUIRED.').items.slice(0, 1), ['lead'], 'lead abatement is its own unit');
assert.ok(!readScope('REPAIR ROOF LEADER AND GUTTER. MISLEADING SIGN.').items.includes('lead'), 'a roof leader is not lead work');
assert.ok(!readScope('REPAIR THE LEAK LEADING TO THE CEILING').items.includes('lead'));
assert.equal(aep.repairSqft, 57, 'sheetrock in both rooms added up');
assert.equal(aep.paintSqft, 270, 'paint in both rooms added up');
assert.equal(readScope('REMOVE 36 SQ.FT. OF CEILING. INSTALL NEW GWB 36 SQ.FT.').repairSqft, 36, 'remove/install of the same area counts once');
assert.equal(readScope('1) TRACE THE LEAK. 2) REPLACE SHEETROCK 40 SQFT. 3) PAINT THE CEILING 96 SQFT.').tasks, 3);
assert.deepEqual(readScope('REPLACE GLASS AT LOWER WINDOW AT LIVING ROOM').items, ['glass'], 'replacing glass is not a new window');
assert.deepEqual(readScope('CRACKED GLASS AT FIRE ESCAPE UPPER WINDOW SASH').items, ['glass'], 'a fire escape window is a place, not fire escape work');
assert.deepEqual(readScope('INSTALL NEW HINGES TO MAKE DOOR SELF-CLOSING').items, ['hinges'], 'new hinges is not a new door');
assert.deepEqual(readScope('TRACE THE WATER LEAK FROM THE PLUMBING FIXTURES ABOVE').items, ['leak', 'plumbing'], 'plumbing fixtures are not electrical');
assert.match(aep.summary, /~57 sq ft repair area · ~270 sq ft to paint/);

// New door vs. new hardware / glass on a door (checked against real HPD descriptions).
const isNew = (d) => readScope(d).items.includes('door-new');
for (const d of [
  'REPLACE THE HOPPER DOOR WITH PROPERLY FIRE RATED HOPPER DOOR BOTTOM HINGED WITH LATCH', // ER00245
  'REMOVE DEFECTIVE HOPPER DOOR AND INSTALL NEW FIRE RATED HOPPER DOOR BOTTOM HINGED THAT WILL SELF CLOSE', // EQ26166
  'MAKE ALL NECESSARY REPAIRS TO REPLACE THE BROKEN/ DEFECTIVE DOOR WITH NEW PROPERLY RATE HEAVY METAL GALVANIZED STEELE DOOR, JAMB', // EQ23130
  'SUPPLY AND INSTALL NEW STEEL FIRE RATED DOUBLE HALLWAY DOOR, ALONG DOOR JAMB WITH SELF- CLOSING HINGE', // EQ28208
  'REPLACE THE BROKEN / DEFECTIVE BILCO DOORS WITH NEW BILCO DOORS SIMILAR TO EXISTING', // EQ32113
  'INSTALL NEW FIRE RATED, SELF CLOSING HOPPER CHUTE DOOR', // ER05393
  'REPLACE BULKHEAD DOOR AT ROOF', // EQ27541
]) assert.ok(isNew(d), `new door: ${d}`);
for (const d of [
  'REPLACE THE BROKEN / DEFECTIVE DOOR LOCK ASSEMBLY', // ER00653
  'REPLACE BROKEN/DEFECTIVE DOOR SECURE TECH SET', // EQ31855
  'REPLACE DOOR ELECTRIC STRIKE PLATE', // EQ22501
  'REPLACE DOOR DEFECTIVE LOCK', // EQ19973
  'INSTALL NEW DOOR LOCK', // EQ16334
  'REPLACE DOOR PASSAGE LOCK', // EQ05961
  'ADJUST OR REPLACE DOOR CLOSURE AND MAKE ALL NECESSARY ADJUSTMENTS', // EQ07411
  'REPLACE DEFECTIVE LATCH SET AT COMPACTOR DOOR WITH NEW PASSAGE LATCH SET', // EQ14145
  'INSTALL NEW GLASS AT VESTIBULE DOOR',
]) assert.ok(!isNew(d), `not a new door: ${d}`);

// Work that costs more than it reads: a whole hopper chute, an ADA / electronic closer, a compactor pump.
assert.ok(readScope('#1: INSTALL NEW HOPPER CHUTE COMPLETE.AND MAKE ALL NECESSARY ADJUSTMENTS').items.includes('hopper-chute'), 'ER03039');
assert.ok(!readScope('REPLACE HOPPER CHUTE DOOR AT 3RD STORY').items.includes('hopper-chute'), 'a hopper chute door is a door, not the chute');
assert.ok(readScope('INSTALL NEW ADA ELECTRONIC DOOR CLOSER').items.includes('ada-closer'), 'EQ31090');
assert.ok(readScope('REPLACE THE LATCH LOCK AND HYDRAULIC PUMP ON THE COMPACTOR DOOR').items.includes('compactor-hydraulic'), 'EQ27441');
assert.ok(!readScope('REPLACE HYDRAULIC CLOSER FOR HOPPER DOOR').items.includes('compactor-hydraulic'), 'a hydraulic closer is a closer');
assert.ok(!isNew('AT 1ST STORY FIRE DOOR LEADING RECYCLE ROOM, INSTALL NEW DOOR PASSAGE LOCK TO SECURE PROPER LATCHING'), 'EQ25182: a new passage lock, not a new door');

// How many doors / windows, however HPD writes it.
assert.equal(readScope('MAKE THE FOLLOWING FIRE DOORS SELF CLOSING: 1) 2ND FL STAIR 2) 3RD FL STAIR 3) 4TH FL HALL').doors, 3, 'a numbered list of the doors');
assert.equal(readScope('REPLACE BOTH HOPPER DOORS AT 3RD AND 5TH STORY').doors, 2);
assert.ok(readScope('APT 2 A-1) INSTALL NEW DOOR CLOSER').doors <= 1, 'apartment letters are not a list');
assert.ok(readScope('REPLACE 3 BROKEN WINDOWS AT KITCHEN').items.includes('window-new'), 'windows (plural) are new windows');
for (const d of ['SECURE-TECH LOCK', 'SECURITECH LOCK', 'SECURATEHC LOCK', 'SECURI-TECH LOCK', 'SECURITYTECH LOCK', 'SECURA TECH LOCK', 'SECURTEC LOCK']) assert.ok(readScope(`REPLACE ENTRANCE DOOR ${d}`).items.includes('secure-tech'), d);

// Rubbish volume counts toward the size.
const rubbish = readScope('REMOVE APPROXIMATELY 80 CU YDS OF RUBBISH FROM THE YARD');
assert.equal(rubbish.cubicYards, 80);
assert.match(rubbish.summary, /~80 cu yd/);
const yards = [
  { id: 'R1', description: 'REMOVE APPROX 10 CU YDS OF RUBBISH FROM YARD', amount: 800 },
  { id: 'R2', description: 'REMOVE APPROX 10 CU YDS OF DEBRIS AND RUBBISH FROM CELLAR', amount: 850 },
  { id: 'R3', description: 'REMOVE 10 CUBIC YARDS OF RUBBISH FROM YARD', amount: 820 },
];
const big = priceHelp('REMOVE APPROX 40 CU YDS OF RUBBISH FROM YARD', yards);
assert.ok(big.middle > 820 && big.middle < 3300, `4x the rubbish costs more, not 4x (${big.middle})`);

// A closer + lock job is priced against closer + lock jobs, not single-closer ones; sizes are adjusted.
const doors = [
  { id: 'C1', description: 'INSTALL NEW DOOR CLOSER. TOTAL DOORS = (1)', amount: 450 },
  { id: 'C2', description: 'INSTALL NEW DOOR CLOSER AT ENTRANCE DOOR. TOTAL DOORS = (1)', amount: 470 },
  { id: 'C3', description: 'REPLACE DOOR CLOSER. TOTAL DOORS = (1)', amount: 460 },
  { id: 'L1', description: 'INSTALL NEW DOOR CLOSER AND NEW PASSAGE LOCK. TOTAL DOORS = (1)', amount: 850 },
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

// A much bigger floor job than any past one is flagged, not quietly priced like the small ones.
const floors = [
  { id: 'F1', description: 'REPLACE BROKEN FLOOR TILES APPROX 10 SQ FT', amount: 600 },
  { id: 'F2', description: 'REPLACE CRACKED FLOOR TILES APPROX 20 SQ FT', amount: 800 },
  { id: 'F3', description: 'REPLACE FLOOR TILES APPROX 30 SQ FT', amount: 900 },
];
const bigFloor = priceHelp('REMOVE ENTIRE BROKEN FLOOR TILES THROUGHOUT THE KITCHEN. INSTALL NEW CERAMIC TILES. APROX 150SQFT', floors);
assert.equal(bigFloor.scope.repairSqft, 150);
assert.equal(bigFloor.confidence, 'low');
assert.match(bigFloor.why, /~150 sq ft, bigger than these jobs \(up to 30 sq ft\): expect to price higher/);

// Price to win, from every awarded glass job (all contractors): you win when you come in under the
// winning price. Recent awards weigh more, and the price direction is shown.
const now = new Date('2026-10-12T12:00:00Z');
const day = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
const glass = [
  ...[420, 440, 450, 460, 470].map((amount, i) => ({ id: `G${i}`, description: 'REPLACE CRACKED GLASS AT WINDOW', amount, date: day(10 + i * 10) })),
  ...[380, 390, 400, 410, 420].map((amount, i) => ({ id: `H${i}`, description: 'REPLACE BROKEN GLASS PANE AT WINDOW', amount, date: day(150 + i * 30) })),
  { id: 'M1', description: 'REPLACE CRACKED GLASS AT WINDOW', amount: 500, date: day(5), won: true },
];
const g = priceHelp('REPLACE CRACKED GLASS AT LIVING ROOM WINDOW', glass, 12, now);
assert.equal(g.count, 11);
assert.equal(g.yours, 1);
assert.ok(winChance(g, 500) < 0.15, `$500 beats almost none of these winning prices (${winChance(g, 500)})`);
assert.ok(winChance(g, g.toWin) >= 0.7, `the "win most" price wins about 3 in 4 (${g.toWin}: ${winChance(g, g.toWin)})`);
assert.ok(g.toWin < g.middle && g.middle < g.high && winChance(g, g.high) < winChance(g, g.middle), 'win most < middle < high, and a higher price wins less often');
assert.ok(winChance(g, 300) === 1 && winChance(g, 9999) === 0);
assert.deepEqual(g.trend && [g.trend.recent > g.trend.before, g.trend.change > 0], [true, true], 'glass prices went up in the last 90 days');
assert.ok(g.middle >= 440, `recent (higher) prices weigh more (${g.middle})`);

// Best price: the most money over time (price x chance of winning), never winning less than 1 in 4.
const bp = bestPrice(g);
assert.ok(bp.price >= g.toWin, `best price is never below the safest price (${bp.price} vs ${g.toWin})`);
assert.ok(bp.chance >= 0.25, `wins at least 1 in 4 (${bp.chance})`);
assert.equal(bp.expected, Math.round(bp.price * winChance(g, bp.price)));
for (const p of [g.toWin, g.middle, g.high]) assert.ok(bp.price * bp.chance >= p * winChance(g, p) - 1, `beats ${p} on expected money`);

// Bid package text helpers.
assert.equal(fill.bidPriceText(1250), '1,250.00');
assert.equal(fill.bidDateText('2026-10-07'), '10/7/26');
assert.equal(fill.bidDescription('NYC HPD EMERGENCY OPERATIONS DIVISION – “ESSENTIAL SERVICE WORK“ AT DOOR: INSTALL CLOSER. CONTRACTOR MUST CONTACT HPD @ 212'), 'AT DOOR: INSTALL CLOSER. REMOVE ALL WORK RELATED DEBRIS.');
// ER07755: 10 numbered door items written with ".." between phrases, and HPD's "TOTAL WINDOWS = 10" under
// a list of doors: 10 doors, no windows.
const er07755 = readScope('1) AT HOPPER DOOR LOCATED AT :PUBLIC HALL, ( 2ND STY ) DEMO REMOVE THE DEFECTIVE HOPPER DOOR AND FRAME. 2) AT STAIR A BULKHEAD DOOR..MAKE ALL NECESSARY REPAIRS TO DOOR AND JAMB. 3) AT STAIR B BULKHEAD DOOR..INSTALL NEW DOOR CLOSER 4) AT 5TH STY PUBLIC HALL STAIR B, MAKE ALL NECESSARY REPAIRS TO DOOR AND STRIKER PLATE 5) AT 5TH STY HOPPER CHUTE..REPLACE DEFECTIVE LATCH SET WITH NEW LATCH SET SAME AS EXISTING..ENSURE DOOR SELF CLOSE AND LATCH 6) AT 1ST STY PUBLIC HALL STAIR B..REPLACE DEFECTIVE LATCH SET WITH NEW PASSAGE LATCH SET..ENSURE DOOR SELF CLOSE AND LATCH 7) AT 1ST STY LAUNDRY ROOM..REPLACE DEFECTIVE HINGES WITH NEW SELF CLOSING HINGES 8) AT 1ST STY REAR YARD DOOR..REPLACE DEFECTIVE PUSHBAR 9) AT 1ST STY PUBLIC HALL VESTIBULE DOOR..MAKE ALL NECESSARY REPAIRS TO DOOR AND SADDLE 10) AT BUILDING ENTRANCE DOOR..REPLACE DEFECTIVE LATCH SET TOTAL WINDOWS = 10 REMOVE ALL WORK RELATED DEBRIS.');
assert.equal(er07755.doors, 10);
assert.equal(er07755.windows, 0);
// Real windows keep their count.
assert.equal(readScope('1) REPLACE BROKEN GLASS AT LOWER SASH 2) REPLACE SASH CORD. TOTAL WINDOWS = 2').windows, 2);
// Measurements: glass pane sizes in inches -> glass sq ft; a room size in feet -> repair area; tile sizes ignored.
const glassJob = readScope('PROPERLY REPLACE THE DEFECTIVE FIRE RATED GLASS ( APPROX. 30”X26”) AND RETURN THE DOOR TO PROPER WORKING ORDER');
assert.equal(glassJob.glassSqft, 5.4);
assert.match(glassJob.summary, /5\.4 sq ft of glass \(30×26 in glass\)/);
assert.equal(readScope('REPLACE 12 X 12 CERAMIC TILES AT KITCHEN FLOOR').glassSqft, 0);
assert.equal(readScope('REPLACE 12 X 12 CERAMIC TILES AT KITCHEN FLOOR').repairSqft, 0, 'a tile size is not an area');
assert.equal(readScope('AT KITCHEN FLOOR 13 X 17 INSTALL NEW VINYL TILES').repairSqft, 221);
assert.equal(readScope('REMOVE 36 SQ FT OF DEFECTIVE PLASTER AT KITCHEN WALL 6 X 6').repairSqft, 36, 'given sq ft wins over a room size');
console.log('PASS bid price help: reads the whole description (glass pane sizes, room sizes, work items, doors, windows, repair and paint sq ft, tasks), matches the same mix of work, adjusts for size, flags work with no history; bid package text');
