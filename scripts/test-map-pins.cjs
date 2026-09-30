const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = ts.createSourceFile('map.tsx', fs.readFileSync('app/field-command/FieldCommandClient.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['groupByLocation', 'ageMarkerHtml', 'individualPinOffset', 'reservePinLabel']);
const functions = file.statements.filter(s => ts.isFunctionDeclaration(s) && names.has(s.name?.text)).map(s => s.getText(file)).join('\n');
const code = ts.transpileModule(functions, {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const reservePinLabel = new Function(code + '\nreturn reservePinLabel;')();
const occupied = [];
assert.equal(reservePinLabel(0,0,occupied),true);
assert.equal(reservePinLabel(20,10,occupied),false);
assert.equal(reservePinLabel(58,0,occupied),true);
assert.equal(reservePinLabel(0,44,occupied),true);
assert.equal(reservePinLabel(0,0,occupied),false);
assert.equal(occupied.length,3);
console.log('PASS: collision-free label reservation, exact duplicates and adjacent labels');
const {groupByLocation, ageMarkerHtml, individualPinOffset} = new Function('HARDHAT_ICON_PATH','STATUS_ICON_PATHS', code + '\nreturn {groupByLocation, ageMarkerHtml, individualPinOffset};')('hat', {pending:'clock',refused:'cross',complete:'check'});
assert.deepEqual(individualPinOffset(0,1), {x:0,y:0});
for (const count of [2,3,4,10,30]) {
  const offsets = Array.from({length:count}, (_,i)=>individualPinOffset(i,count));
  assert.equal(new Set(offsets.map(p=>`${p.x}|${p.y}`)).size,count);
  for (let i=0;i<count;i++) for(let j=i+1;j<count;j++) {
    assert.ok(Math.abs(offsets[i].x-offsets[j].x)>=54 || Math.abs(offsets[i].y-offsets[j].y)>=40);
  }
}
const a = {job:{OMO:'A'}, lat:40.7, lng:-73.9};
const b = {job:{OMO:'B'}, lat:40.700001, lng:-73.9};
const c = {...a, job:{OMO:'C'}};
const grouped = groupByLocation([a,b,c]);
assert.equal(grouped.length,2);
assert.deepEqual(grouped[0].jobs.map(j=>j.OMO), ['A','C']);
assert.equal(grouped[0].lat,a.lat);
for (const zoom of [11,14,18]) {
  assert.match(ageMarkerHtml(150,true,zoom), /150<small>d/);
  assert.match(ageMarkerHtml(150,true,zoom), /--pin-color:#0a84ff/);
}
assert.match(ageMarkerHtml(-7,true), /\+7<small>d/);
assert.match(ageMarkerHtml(0,true), />0<small>d/);
assert.match(ageMarkerHtml(null,true), /\?<small>d/);
assert.match(ageMarkerHtml(null,false,14,false,'#ff453a','refused'), /#ff453a/);
assert.doesNotMatch(ageMarkerHtml(null,false), /<strong>/);
assert.match(ageMarkerHtml(30,true,14,true), /has-more/);
console.log('PASS: exact-location grouping, distinct nearby jobs, maturity numbers at every zoom, pending color and recorded outcomes');
