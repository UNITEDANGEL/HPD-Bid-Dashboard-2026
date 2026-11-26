// 📸 New worker photos (plan item 43): the "new from worker" tag shows while the worker's photos came in after the job
// card last brought them in, and goes away after 14 days.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/worker-new.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { workerNew, workerNewSet } = mod.exports;

const now = Date.parse('2026-11-26T15:00:00Z');
assert.equal(workerNew(null, now), false);
assert.equal(workerNew({}, now), false, 'nothing from the worker');
assert.equal(workerNew({ WorkerNewAt: '2026-11-26T14:00:00Z' }, now), true, 'new, not seen');
assert.equal(workerNew({ WorkerNewAt: '2026-11-26T14:00:00Z', WorkerSeenAt: '2026-11-26T14:30:00Z' }, now), false, 'seen after');
assert.equal(workerNew({ WorkerNewAt: '2026-11-26T14:00:00Z', WorkerSeenAt: '2026-11-25T10:00:00Z' }, now), true, 'seen before the new ones');
assert.equal(workerNew({ WorkerNewAt: '2026-11-01T14:00:00Z' }, now), false, 'older than 14 days');
assert.equal(workerNew({ WorkerNewAt: 'junk' }, now), false);
const set = workerNewSet({ ER08795: { WorkerNewAt: '2026-11-26T14:00:00Z' }, EQ12345: { WorkerNewAt: '2026-11-26T14:00:00Z', WorkerSeenAt: '2026-11-26T14:10:00Z' }, 'CHANGE-REQUEST-1': { WorkerNewAt: '2026-11-26T14:00:00Z' } }, now);
assert.deepEqual([...set], ['ER08795'], 'only job numbers, only unseen');
console.log('worker-new tests passed');
