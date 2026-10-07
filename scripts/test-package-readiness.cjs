const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',code)(name => load(path.resolve(path.dirname(file),name+'.ts')),module,module.exports);
  return module.exports;
}
const {packageReadiness: check} = load(path.resolve('lib/package-readiness.ts'));
const job = {OMO:'TEST-0001',AwardDate:'8/28/26',AwardAmount:'$100.00',BuildingAddress:'Test address',JobDescription:'Replace damaged entrance door hinges.',FieldOutcome:'WORK_COMPLETED',ActualWorkStartDate:'2026-09-01',ActualWorkCompletionDate:'2026-09-02'};
const original = JSON.stringify(job);
assert.equal(check(job,{before:1,after:1}).issues.length,0);
assert.match(check({...job,AwardAmount:''},{before:1,after:1}).issues.join(' '),/award amount/);
assert.match(check(job,{before:0,after:0}).issues.join(' '),/No before.*No after/);
assert.match(check({...job,AwardDate:'8/27/26'},{before:1,after:1}).issues.join(' '),/Legacy/);
assert.match(check({...job,AwardDate:'2/30/26'},null).issues.join(' '),/Verify the award date/);
assert.match(check(job,null).issues.join(' '),/completeness is unknown/);
assert.match(check({...job,ActualWorkCompletionDate:'2026-08-01'},null).issues.join(' '),/finish precedes/);
assert.match(check({...job,FieldOutcome:''},{before:1,after:1}).issues.join(' '),/actual visit outcome/);
for (const FieldOutcome of ['REFUSED_ACCESS','NO_ACCESS_1_WAITING_72H','WORK_COMPLETED_BY_OTHERS']) {
  assert.doesNotMatch(check({...job,FieldOutcome},{before:0,after:0}).issues.join(' '),/No before|No after/);
}
assert.match(check(job,{before:1,after:1}).review,/Nothing is generated or sent/);
assert.equal(JSON.stringify(job),original);
console.log('PASS: template cutoff, missing media, no-work scenarios, invalid/reversed dates, outcome and no mutations');
