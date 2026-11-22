// 📞 Late jobs: who to call (plan item 23): tenant first, the saved super next, only late / almost-due jobs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = {};
const load = (f) => { if (cache[f]) return cache[f]; const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; cache[f] = m.exports; new Function('exports', 'module', 'require', code)(m.exports, m, (p) => p.startsWith('.') ? load(path.join(path.dirname(f), p) + '.ts') : require(p)); return m.exports; };
const { whoToCall } = load('lib/late-call.ts');
const rows = [{ omo: 'ER1', days: -5 }, { omo: 'ER2', days: 0 }, { omo: 'ER3', days: 2 }, { omo: 'ER4', days: 9 }, { omo: 'ER5', days: -1 }, { omo: 'ER6', days: -2 }];
const tenants = {
  ER1: { ItbTenantName: 'MARIA LOPEZ', ItbTenantPhone: '718 555 0142' },
  ER2: { ItbTenantName: 'T', ItbTenantPhone: '109 551 0156', ItbTenantAccessType: '' }, // not a real phone -> super
  ER3: { ItbTenantAccessType: 'Common Area', ItbTenantPhone: '718 555 0199' }, // public hall -> super
  ER4: { ItbTenantName: 'FAR AWAY', ItbTenantPhone: '718 555 0100' }, // 9 days left -> no button
  ER6: { TenantName: 'JOHN DOE', TenantPhone: '(347) 555-0123' },
};
const addresses = { ER2: '1020 Boynton Ave., 10472', ER3: '55 West 3rd St', ER5: '9 Nowhere Pl' };
const contacts = { '1020 BOYNTON AVENUE': { name: 'Mr. Ruiz', phone: '646-555-0177' }, '55 WEST 3 STREET': { phone: '2125550111' } };
const r = whoToCall({ rows, tenants, addresses, contacts });
assert.deepEqual(Object.keys(r).sort(), ['ER1', 'ER2', 'ER3', 'ER6']);
assert.deepEqual(r.ER1, { omo: 'ER1', who: 'Maria', phone: '(718) 555-0142', tel: '+17185550142', kind: 'tenant' });
assert.deepEqual(r.ER2, { omo: 'ER2', who: 'Mr. Ruiz', phone: '(646) 555-0177', tel: '+16465550177', kind: 'super' });
assert.equal(r.ER3.who, 'the super');
assert.equal(r.ER3.kind, 'super');
assert.equal(r.ER6.who, 'the tenant'); // "JOHN DOE" is a placeholder name
// Not signed in: no tenant phones, only saved supers.
const n = whoToCall({ rows, tenants: null, addresses, contacts });
assert.deepEqual(Object.keys(n).sort(), ['ER2', 'ER3']);
console.log('late-call tests passed');
