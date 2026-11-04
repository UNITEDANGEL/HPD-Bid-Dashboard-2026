// 🔍 Search everything and 💡 one tip a day (4 Nov): the best match per job with the sentence that matched; a tip
// from your own numbers (what won most, more / fewer bids, overdue notices).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const load = (f) => { const code = ts.transpileModule(fs.readFileSync(path.resolve(f), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(require, mod, mod.exports); return mod.exports; };
const { searchAll, searchQuery } = load('lib/search-all.ts');
const { dailyTip } = load('lib/daily-tip.ts');

assert.equal(searchQuery('find the job where the tenant said the dog bites'), 'the job where the tenant said the dog bites');
assert.equal(searchQuery('Which job had the broken boiler?'), 'the broken boiler');
const docs = [
  { job: 'ER00001', kind: 'visit', text: 'No access. Tenant said the dog bites, call before coming.' },
  { job: 'ER00002', kind: 'work', text: 'Replace broken door closer at entrance.' },
  { job: 'ER00003', kind: 'job note', text: 'Big dog in apartment 4B.' },
  { job: '', kind: 'note', text: 'Super at 123 Main is in the basement.' },
];
const hits = searchAll(searchQuery('find the job where the tenant said the dog bites'), docs);
assert.equal(hits[0].job, 'ER00001');
assert.match(hits[0].snippet, /dog bites/);
assert.equal(hits.length, 1, 'half the words at least');
assert.equal(searchAll('dog', docs).length, 2, 'dog in two jobs');
assert.equal(searchAll('super basement', docs)[0].kind, 'note');
assert.deepEqual(searchAll('the of and', docs), []);

const wins = [
  { kind: 'Door closer', amount: 400, date: '2026-10-20' },
  { kind: 'Door closer', amount: 500, date: '2026-10-25' },
  { kind: 'Plaster', amount: 900, date: '2026-10-28' },
  { kind: 'Door closer', amount: 0, date: '2026-08-01' },
];
assert.equal(dailyTip({ wins, sentThisWeek: 0, sentLastWeek: 0, overdueNotices: 0, today: '2026-11-04' }), '💡 Door closer won the most in the last 30 days: 2 of your 3 wins, about $450 each.');
assert.match(dailyTip({ wins: [], sentThisWeek: 12, sentLastWeek: 8, overdueNotices: 0, today: '2026-11-04' }), /12 bids sent in the last 7 days, 4 more/);
assert.match(dailyTip({ wins: [], sentThisWeek: 2, sentLastWeek: 10, overdueNotices: 0, today: '2026-11-04' }), /2 bids in the last 7 days \(10 the week before\)/);
assert.match(dailyTip({ wins: [], sentThisWeek: 0, sentLastWeek: 0, overdueNotices: 1, today: '2026-11-04' }), /1 notice is overdue/);
assert.equal(dailyTip({ wins: [], sentThisWeek: 0, sentLastWeek: 0, overdueNotices: 0, today: '2026-11-04' }), '');
console.log('search + tip ok: dog bites -> ER00001 with the sentence, notes found, stop words ignored; tips from wins, bid pace and overdue notices');
