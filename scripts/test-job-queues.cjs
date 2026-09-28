const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('lib/job-queue.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod = {exports:{}};
new Function('exports','module',source)(mod.exports,mod);
const {jobQueue,matchesJobQueue,savedJobStatus} = mod.exports;
for(const status of ['Awarded','Pending','Open','Work in progress']) assert.equal(jobQueue({Status:status}),'pending');
for(const status of ['No Access - 1st Attempt','No Access - 2nd Attempt','Refused Access','Partial Work Completed','Appointment requested','Scheduled','Not completed','Incomplete']) assert.equal(jobQueue({Status:status}),'followup');
for(const status of ['Work completed','Completed by others','Closed','Cancelled']) assert.equal(jobQueue({Status:status}),'completed');
for(const value of [true,1,'true','1']) assert.equal(jobQueue({Status:'No access',ArchivedFromMap:value}),'archived');
assert.equal(jobQueue({Status:'Awarded',ArchivedFromMap:'false'}),'pending');
assert.equal(jobQueue({Status:'Archived'}),'archived');
assert.equal(savedJobStatus({Status:'Awarded',WorkflowStatus:'Refused Access'}),'Refused Access');
const rows=JSON.parse(fs.readFileSync('public/data/COA_Fetcher_2026.json','utf8'));
const original=JSON.stringify(rows);
const counts={pending:0,followup:0,completed:0,archived:0};
for(const job of rows) {
  counts[jobQueue(job)]++;
  assert.equal(Object.keys(counts).filter(key=>matchesJobQueue(job,key)).length,1);
  assert.equal(matchesJobQueue(job,'all'),true);
}
assert.equal(JSON.stringify(rows),original);
assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),rows.length);
console.log('PASS: disjoint queues, status precedence, archive flags, all records preserved',counts);
