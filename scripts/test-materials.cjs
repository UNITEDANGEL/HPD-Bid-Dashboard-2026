// 📦 What to bring (4 Nov): materials from HPD's work descriptions, most-needed first, window guards not counted as glass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/materials.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { materialsFor } = mod.exports;
const list = materialsFor([
  { id: 'ER00001', text: 'Repair broken plaster and paint ceiling in bedroom. Replace smoke detector.' },
  { id: 'ER00002', text: 'Install window guards at 2 windows in living room. Paint walls.' },
  { id: 'ER00003', text: 'Repair leaking faucet at kitchen sink.' },
]);
const item = (re) => list.find((m) => re.test(m.item));
assert.deepEqual(item(/Paint/).jobs, ['ER00001', 'ER00002']);
assert.equal(list[0].item.includes('Paint'), true, 'most-needed first');
assert.deepEqual(item(/Plaster/).jobs, ['ER00001']);
assert.deepEqual(item(/Smoke/).jobs, ['ER00001']);
assert.deepEqual(item(/Window guards/).jobs, ['ER00002']);
assert.equal(item(/glass/), undefined, 'window guards are not window glass');
assert.deepEqual(item(/Plumbing/).jobs, ['ER00003']);
assert.deepEqual(materialsFor([{ id: 'X', text: 'Inspect the premises.' }]), []);
console.log('materials ok: paint x2 first, plaster, smoke detector, window guards (not glass), plumbing');
