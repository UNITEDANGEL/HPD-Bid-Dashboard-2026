const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/jobLocation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { cleanJobLocation } = mod.exports;

// The HPD fax/contact line that lands in the apartment field is never a location.
const fax = '(718)989-1382FAX:PROCUREMENTSPECIALIST:';
const at = (description) => cleanJobLocation({ ItbTenantApartment: fax, Location: fax, ItbPage3Description: description });

// Public-area wording from real ITBs (the invoice printed a blank Work Location for these).
assert.equal(at('REPAIR COMPACTOR CLOSET DOOR AT 5TH STORY'), 'Compactor Closet');
assert.equal(at('REPAIR HOPPER CHUTE AT 4TH STORY'), 'Compactor Closet');
assert.equal(at('AT DOOR LEADING TO REFUSE ROOM ( 16TH STORY), MAKE DOOR SELF CLOSING'), 'Refuse Room');
assert.equal(at('THE FIRST FIRE ESCAPE FROM NORTH AT WEST, AT BUILDING FRONT'), 'Fire Escape');
assert.equal(at('DROP LADDER AT BUILDING FRONT'), 'Fire Escape');
assert.equal(at('INSTALL NEW HINGES AT BLDG. FRONT ENTRANCE DOOR'), 'Building Entrance');
assert.equal(at('AT FIRE DOOR 5TH STORY AT WEST. INSTALL NEW HINGES'), 'Public Hall');

// Earlier rules still win, and an unclear description is left blank rather than guessed.
assert.equal(at('PUBLIC HALL FIRE DOOR AT 3RD STORY'), 'Public Hall');
assert.equal(at('COMPACTOR ROOM IN CELLAR'), 'Common Area');
assert.equal(at('AT CEILING NEAR SKY LIGHT REPAIR CEILING'), '');
assert.equal(cleanJobLocation({ ItbTenantApartment: '2R', ItbPage3Description: 'COMPACTOR' }), '2R');

console.log('job location tests passed');
