const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/planner-dictation.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod = {exports:{}};
new Function('exports','module',code)(mod.exports,mod);
let engine, drafts, statuses, ended;
class Engine { constructor(){engine=this;} start(){} abort(){this.aborted=true;} }
function start(C=Engine){ drafts=[];statuses=[];ended=0;return mod.exports.startDictation(C,t=>drafts.push(t),t=>statuses.push(t),()=>ended++); }
let stop=start();
engine.onresult({results:[[{transcript:'Brooklyn today'}]]});
assert.deepEqual(drafts,['Brooklyn today']);assert.equal(engine.continuous,false);
stop();engine.onresult({results:[[{transcript:'late'}]]});engine.onend();
assert.equal(ended,1);assert.equal(drafts.length,1);assert.equal(engine.aborted,true);
start();engine.onerror({error:'not-allowed'});engine.onend();
assert.match(statuses[0],/permission denied/);assert.equal(ended,1);
start(class extends Engine {start(){throw Error('unavailable');}});
assert.equal(ended,1);assert.match(statuses[0],/Could not start/);
start();engine.onresult({results:[[{transcript:' '}]]});engine.onend();assert.deepEqual(drafts,[]);
console.log('PASS: dictation draft, cancellation, late events, denied permission, start failure, empty result');
