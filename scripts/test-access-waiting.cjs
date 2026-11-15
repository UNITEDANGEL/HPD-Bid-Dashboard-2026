const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/access-waiting.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require);
const { accessWaiting, triesText } = m.exports;
const notes = {
  A1: [{ text: 'No access proof: Nov 3, 10:00 AM, 1 door photo, 0 call tries.', at: '2026-11-03T15:00:00Z' }, { text: 'gate code 1234', at: '2026-11-04T15:00:00Z' }, { text: 'No access proof: Nov 7, 9:00 AM, no door photo, 1 call try.', at: '2026-11-07T14:00:00Z' }],
  B2: [{ text: 'No access proof: Nov 5', at: '2026-11-05T15:00:00Z' }],
  C3: [{ text: 'No access proof: Nov 1', at: '2026-11-01T15:00:00Z' }],
  D4: [{ text: 'just a note', at: '2026-11-01T15:00:00Z' }],
  'TEST-0001': [{ text: 'No access proof: x', at: '2026-11-01T15:00:00Z' }],
};
const r = accessWaiting({ notes, sent: { C3: { sentAt: '2026-11-09' } } });
assert.deepEqual(r.map((x) => x.omo), ['B2', 'A1']);
assert.deepEqual(r[1].tries, ['2026-11-03', '2026-11-07']);
assert.equal(triesText(r[1].tries), 'Nov 3 · Nov 7');
assert.deepEqual(accessWaiting({ notes: null }), []);
console.log('access-waiting tests passed');
