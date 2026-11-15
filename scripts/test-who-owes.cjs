const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/who-owes.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, require);
const { whoOwes } = m.exports;
const r = whoOwes({
  today: '2026-11-14',
  sent: { A: { sentAt: '2026-10-14' }, B: { sentAt: '2026-11-04' }, C: { sentAt: '2026-09-01' }, D: { sentAt: '2026-10-01' }, E: {} },
  pipPaid: { jobs: { A: { status: 'not paid yet', outstanding: 388 }, B: { status: 'partly paid', outstanding: 50 }, C: { status: 'paid', outstanding: 0 }, D: { status: 'not paid yet', outstanding: 0 }, E: { status: 'not paid yet', outstanding: 9 } } },
});
assert.deepEqual(r.jobs, [{ omo: 'A', days: 31, amount: 388, partly: false }, { omo: 'B', days: 10, amount: 50, partly: true }]);
assert.equal(r.total, 438); assert.equal(r.count, 2);
assert.equal(whoOwes({ today: '2026-11-14' }).count, 0);
console.log('who-owes tests passed');
