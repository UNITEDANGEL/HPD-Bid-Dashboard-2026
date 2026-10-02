const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loadTs(file) {
  const context = { exports: {}, require: name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts')) : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const { isJunkDescription, longestCleanDescription, firstCleanDescription } = loadTs(path.join(root, 'lib/description-quality.ts'));
const { getJobDescription } = loadTs(path.join(root, 'lib/paperwork.ts'));

const formJunk = 'FORM GC: ELEV ATOR: ASBESTOS: LEAD: OTHER: APT(S)/LOCATION(S) PROCEDURES MATERIAL(S) SIZE QUANTITY REMARKS Provide/Install Abate Remove';
const wageJunk = 'General Decision Number: NY200003 04/10/2020Superse ded General Decision Number: NY190003 State: New York Page 3 of 3 OMO No: TEST';
const real = 'REPAIR VESTIBULE DOOR';

assert.ok(isJunkDescription(formJunk));
assert.ok(isJunkDescription(wageJunk));
assert.ok(!isJunkDescription(real));
assert.ok(!isJunkDescription(undefined));

// A longer junk field must not hide a shorter real one.
const keys = ['ItbPage3Description', 'description', 'JobDescription'];
assert.equal(longestCleanDescription({ ItbPage3Description: formJunk, description: real }, keys), real);
assert.equal(longestCleanDescription({ description: wageJunk, ItbPage3Description: real }, keys), real);
assert.equal(firstCleanDescription({ ItbPage3Description: formJunk, description: real }, keys), real);
assert.equal(longestCleanDescription({ description: wageJunk, JobDescription: formJunk }, keys), '');

// Invoice description falls back to trade when every field is junk.
assert.equal(getJobDescription({ ItbPage3Description: formJunk, description: real }), real);
assert.equal(getJobDescription({ description: wageJunk, Trade: 'CARPENTRY' }), 'CARPENTRY');
assert.equal(getJobDescription({ description: wageJunk }), '');

// Leftover ": " from the ITB label is stripped.
assert.equal(getJobDescription({ ItbPage3Description: ': AT SECTION B REPAIR DOOR' }), 'AT SECTION B REPAIR DOOR');

console.log('Description quality: junk ITB text skipped in favour of clean fields.');
