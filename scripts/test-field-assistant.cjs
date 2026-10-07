const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), module, module.exports);
  return module.exports;
}
const {answerFieldQuestion: answer} = load(path.resolve('lib/field-assistant.ts'));
const now = new Date('2026-10-07T00:30:00Z');
const jobs = [
  {OMO:'EQ16592', AwardDate:'1/15/26', WorkCompletionDate:'1/23/26', Status:'New'},
  {OMO:'ER00001', AwardDate:'1/1/26', WorkCompletionDate:'1/5/26', WorkflowStatus:'Refused access'},
  {OMO:'EO00002', AwardDate:'1/1/26', WorkCompletionDate:'1/6/26', WorkflowStatus:'No access 2nd'},
  {OMO:'TEST-0001', AwardDate:'10/1/26', WorkCompletionDate:'10/20/26', Status:'New'},
];
const original = JSON.stringify(jobs);
assert.match(answer('Tell me about EQ16592', jobs, '', now).text, /256 days overdue/);
assert.match(answer('Can I go again?', jobs, 'ER00001', now).text, /Do not make another visit/);
assert.match(answer('Status EO00002', jobs, '', now).text, /Do not make another visit/);
assert.match(answer('I arrived', jobs, 'EQ16592', now).text, /Nothing was saved/);
assert.match(answer('email package', jobs, '', now).text, /Which work order/);
assert.match(answer('Status EQ99999', jobs, 'EQ16592', now).text, /cannot find EQ99999/);
const oldest = answer('Which jobs are oldest overdue?', jobs, 'TEST-0001', now).text;
assert.match(oldest, /EQ16592/);
assert.doesNotMatch(oldest, /ER00001|EO00002/);
assert.match(answer('Tell me about TEST-0001', jobs, '', now).text, /Due in 14 days/);
for (const prompt of ['Plan 5 jobs near me', '5 urgent Queens jobs', 'Nearest jobs first', 'Appointments first', 'finish by 5', 'last 7 days']) {
  assert.equal(answer(prompt, jobs), null, prompt);
}
assert.match(answer('hello', jobs).text, /free local assistant/);
assert.match(answer('What next?', [{...jobs[0], WorkflowStatus:'VISIT_STARTED'}], 'EQ16592', now).text, /Do not start a duplicate visit/);
assert.equal(JSON.stringify(jobs), original);
console.log('PASS: local guidance, NY dates, visit safeguards, follow-up context, route delegation and no job mutations');
