// 🧾 🗺 🎉 🧠 The robot's own answers (owner, 4 Nov: "do all ideas"): missing paperwork oldest first, where the time goes,
// the good-news replay, and the conversation kept 3 days. Worked out on the phone; nothing is sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/robot-insights.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { missingPaperwork, timeInsight, goodNews, loadChatMemory, saveChatMemory, earlierDays } = mod.exports;

// 🧾 Missing paperwork: what's missing per job, oldest first; done jobs and appointments left out.
const gaps = missingPaperwork([
  { id: 'ER00002', address: 'B', outcome: 'WORK_COMPLETED', finishedAt: '2026-11-03', before: 3, after: 0, approved: false, invoiceDone: false },
  { id: 'ER00001', address: 'A', outcome: 'WORK_COMPLETED', finishedAt: '2026-10-20', before: 2, after: 2, approved: true, invoiceDone: false },
  { id: 'ER00003', address: 'C', outcome: 'WORK_COMPLETED', finishedAt: '2026-10-01', before: 2, after: 2, approved: true, invoiceDone: true },
  { id: 'ER00004', address: 'D', outcome: 'REFUSED_ACCESS', finishedAt: '2026-10-25', before: 0, after: 0, approved: false, invoiceDone: false },
  { id: 'ER00005', address: 'E', outcome: 'APPOINTMENT_REQUESTED', finishedAt: '2026-10-02', before: 0, after: 0, approved: false, invoiceDone: false },
]);
assert.deepEqual(gaps.map((g) => g.id), ['ER00001', 'ER00004', 'ER00002']);
assert.deepEqual(gaps[0].missing, ['the invoice']);
assert.deepEqual(gaps[1].missing, ['the affidavit'], 'no photos or invoice asked for a refusal');
assert.deepEqual(gaps[2].missing, ['after photos', 'the affidavit', 'the invoice']);

// 🗺 Where the time goes: the slowest borough against your usual, with a tip.
assert.match(timeInsight([{ borough: 'Queens', kind: 'Plaster', minutes: 40 }]), /only timed 1 job/);
const t = timeInsight([
  { borough: 'Queens', kind: 'Plaster', minutes: 40 }, { borough: 'Queens', kind: 'Plaster', minutes: 50 },
  { borough: 'Bronx', kind: 'Leak', minutes: 120 }, { borough: 'Bronx', kind: 'Leak', minutes: 100 },
]);
assert.match(t, /^Your usual job takes 1 h 18 min on site \(4 timed\)\. Bronx is the slowest: 1 h 50 min on average over 2 jobs\. Leak jobs take longest: 1 h 50 min each\. Tip: put the Bronx jobs together/);
assert.match(timeInsight([{ borough: 'Queens', kind: 'A', minutes: 40 }, { borough: 'Queens', kind: 'A', minutes: 42 }, { borough: 'Bronx', kind: 'A', minutes: 41 }]), /your time is even/);

// 🎉 Good news.
assert.equal(goodNews({ wins: 2, winMoney: 3400, bidsSent: 5, finished: 1, packagesSent: 1, name: 'Jot' }), '🎉 Great day! Today, Jot: 2 jobs won worth $3,400, 5 bids sent, 1 job finished and 1 package sent to HPD.');
assert.equal(goodNews({ wins: 0, winMoney: 0, bidsSent: 3, finished: 0, packagesSent: 0 }), '🎉 Nice work! Today: 3 bids sent.');
assert.match(goodNews({ wins: 0, winMoney: 0, bidsSent: 0, finished: 0, packagesSent: 0 }), /Quiet day/);

// 🧠 Kept 3 days; the turns from before today go to the AI as "earlier days".
const now = Date.parse('2026-11-04T16:00:00Z');
saveChatMemory([{ you: 'old', helper: 'four days ago', at: now - 4 * 86400000 }, { you: 'did the video go out', helper: 'Not yet.', at: now - 86400000 }, { you: 'hi', helper: 'Hi!', at: now - 60000 }], now);
assert.deepEqual(loadChatMemory(now).map((x) => x.you), ['did the video go out', 'hi']);
assert.deepEqual(earlierDays(loadChatMemory(now), now), [{ day: '2026-11-03', you: 'did the video go out', helper: 'Not yet.' }]);
console.log('robot insights ok: missing paperwork oldest first (what is missing per job), where the time goes with a tip, the good-news replay, the conversation kept 3 days with earlier days for the AI');
