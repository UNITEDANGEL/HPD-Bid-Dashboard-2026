const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (f, deps = {}) => { const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('exports', 'module', 'require', code)(m.exports, m, (n) => deps[n] || require(n)); return m.exports; };
const costs = load('lib/job-costs.ts');
const { jobMade } = load('lib/job-made.ts', { './job-costs': costs });
const c = [{ at: 'a', amount: 120.5, what: 'paint' }, { at: 'b', amount: 79.5, what: 'door closer' }];
// Award $1,500, costs $200 -> made $1,300; 2 hours on site -> $650 an hour.
const r = jobMade({ award: 1500, costs: c, closed: true, minutesOnSite: 120 });
assert.equal(r.made, 1300); assert.equal(r.costs, 200); assert.equal(r.perHour, 650);
assert.equal(r.text, '💰 Made $1,300 on this job: $1,500 award − $200 costs · about $650 an hour on site');
// Not closed, no costs, or no award -> nothing.
assert.equal(jobMade({ award: 1500, costs: c, closed: false }), null);
assert.equal(jobMade({ award: 1500, costs: [], closed: true }), null);
assert.equal(jobMade({ award: 0, costs: c, closed: true }), null);
// Over budget -> Lost; short visit -> no per-hour.
const loss = jobMade({ award: 100, costs: c, closed: true, minutesOnSite: 5 });
assert.equal(loss.made, -100); assert.equal(loss.perHour, null); assert.match(loss.text, /^💰 Lost \$100 on this job: \$100 award − \$200 costs$/);
console.log('job-made tests passed');
