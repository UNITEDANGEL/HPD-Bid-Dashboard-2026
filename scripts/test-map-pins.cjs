const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = ts.createSourceFile('map.tsx', fs.readFileSync('app/field-command/FieldCommandClient.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['groupByLocation', 'jobPinHtml', 'shortClock', 'individualPinOffset', 'reservePinLabel']);
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
// Stand-ins for the appointment / 2nd-try helpers the pin reads (tested in their own files).
let timing = null, second = null;
const appt = { date: '2026-10-06', start: '14:30', end: '15:30', state: 'confirmed' };
const {groupByLocation, jobPinHtml, individualPinOffset} = new Function('HARDHAT_ICON_PATH','FLASK_ICON_PATH','STATUS_ICON_PATHS','activeAppointment','appointmentTiming','appointmentLabel','secondTryState',
  code + '\nreturn {groupByLocation, jobPinHtml, individualPinOffset};')('hat', 'flask', {done:'check',refused:'cross',noaccess:'lock',appointment:'cal'},
  (job) => job.Appointment || null, () => timing, () => 'Wed 10/07 · 2:30–3:30 PM', () => second);
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
const open = (days) => jobPinHtml({}, { key: 'awarded', color: '#2563eb' }, { days, pending: true }, 0);
assert.match(open(150), /fc-pin is-awarded is-late/);
assert.match(open(150), /<span class="fc-pin-chip">150d<\/span>/);
assert.match(open(150), /--pin:#2563eb/);
assert.match(open(150), />hat</, 'new work shows the hard hat');
assert.match(open(12), /is-overdue/);
assert.match(open(0), /fc-pin-chip">today</);
assert.match(open(-7), /fc-pin-chip">in 7d</);
assert.doesNotMatch(jobPinHtml({}, { key: 'done', color: '#16a34a' }, { days: null, pending: false }, 2), /fc-pin-chip/, 'finished work has no chip');
assert.match(jobPinHtml({}, { key: 'done', color: '#16a34a' }, { days: null, pending: false }, 2), /fc-pin-visits">2</);
// Appointments: the time today; a countdown and a glow within 2 hours; nothing once it's over.
const booked = { Appointment: appt };
timing = { today: true, soon: false, past: false, startsIn: 300, days: 0 };
assert.match(jobPinHtml(booked, { key: 'appointment', color: '#d97706' }, { days: 3, pending: true }, 0), /is-appointment is-today[^]*fc-pin-chip">2:30p</);
timing = { today: true, soon: true, past: false, startsIn: 45, days: 0 };
assert.match(jobPinHtml(booked, { key: 'appointment', color: '#d97706' }, { days: 3, pending: true }, 0), /is-soon[^]*fc-pin-chip">45m</);
timing = { today: true, soon: true, past: false, startsIn: -10, days: 0 };
assert.match(jobPinHtml(booked, { key: 'appointment', color: '#d97706' }, { days: 3, pending: true }, 0), /fc-pin-chip">now</);
timing = { today: false, soon: false, past: false, startsIn: 1500, days: 1 };
assert.match(jobPinHtml(booked, { key: 'appointment', color: '#d97706' }, { days: 3, pending: true }, 0), /fc-pin-chip">tmrw</);
timing = { today: false, soon: false, past: true, startsIn: -200, days: 0 };
assert.doesNotMatch(jobPinHtml(booked, { key: 'appointment', color: '#d97706' }, { days: null, pending: false }, 0), /is-soon|is-today/);
// No access: "2nd try" once the 2nd try is due.
second = { due: true };
// The test job: purple flask pin tagged TEST, whatever its status.
assert.match(jobPinHtml({ IsTestJob: true }, { key: 'done', color: '#16a34a' }, { days: 3, pending: true }, 1), /is-test" style="--pin:#7c3aed"><span class="fc-pin-head"><svg[^>]*>flask<[^]*fc-pin-chip">TEST</);
assert.doesNotMatch(jobPinHtml({}, { key: 'awarded', color: '#2563eb' }, { days: 3, pending: true }, 0), /is-test|TEST/);
assert.match(jobPinHtml({}, { key: 'noaccess', color: '#6b7280' }, { days: 20, pending: true }, 1), /is-due[^]*fc-pin-chip">2nd try</);
second = { due: false };
assert.doesNotMatch(jobPinHtml({}, { key: 'noaccess', color: '#6b7280' }, { days: null, pending: false }, 1), /2nd try/);
console.log('PASS: exact-location grouping, distinct nearby jobs, status teardrop pins with days late, appointment times and countdowns, 2nd-try and visit badges');
