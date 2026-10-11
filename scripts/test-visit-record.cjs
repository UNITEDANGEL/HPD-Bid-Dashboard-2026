const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/visit-record.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { feetBetween, visitLocationFields, visitRecordText } = mod.exports;

const building = { lat: 40.85166, lng: -73.937602 };
// About 0.0001 degrees of latitude is ~36 ft.
assert.ok(Math.abs(feetBetween(building, { lat: 40.85176, lng: -73.937602 }) - 36) <= 1);
const now = Date.parse('2026-10-05T13:20:00Z');
assert.deepEqual(visitLocationFields({ lat: 40.85176, lng: -73.937602, accuracy: 8.4, at: now - 60000 }, building, now), { latitude: 40.85176, longitude: -73.937602, accuracyMeters: 8, feetFromJob: 36 });
assert.deepEqual(visitLocationFields({ lat: 40.85176, lng: -73.937602, at: now - 11 * 60000 }, building, now), {}, 'an old GPS fix is not used');
assert.deepEqual(visitLocationFields(null, building, now), {});

const job = {
  TravelStartedAt: '2026-10-01T12:40:00Z', TravelVia: 'Waze',
  FieldArrivedAt: '2026-10-01T13:14:00Z', ArrivedLatitude: 40.85176, ArrivedLongitude: -73.937602, ArrivedAccuracyMeters: 8, ArrivedAutomatically: true,
  NoAccessFirstAttemptAt: '2026-10-01T13:20:00Z', NoAccessSecondAttemptAt: '2026-10-05T13:20:00Z',
  FieldVisitHistory: [
    { recordedAt: '2026-10-01T13:20:00Z', outcome: 'NO_ACCESS_1_WAITING_72H', note: '', latitude: 40.85176, longitude: -73.937602, accuracyMeters: 8, feetFromJob: 36 },
    { recordedAt: '2026-10-05T13:20:00Z', outcome: 'NO_ACCESS_1_WAITING_72H', note: '2nd try: no access', latitude: 40.8519, longitude: -73.9376, feetFromJob: 87 },
  ],
};
const text = visitRecordText({ jobId: 'ER05729', address: '500 FT WASHINGTON AVENUE, 10033' }, job, [{ kind: 'before', mediaType: 'image', capturedAt: '2026-10-01T13:18:00Z' }], building, '2026-10-05T14:00:00Z');
assert.match(text, /^VISIT RECORD \(internal proof/);
assert.match(text, /Job: ER05729 · 500 FT WASHINGTON AVENUE, 10033/);
assert.match(text, /Thu 10\/01\/26 8:40 AM  On the way \(Waze\)/);
assert.match(text, /Thu 10\/01\/26 9:14 AM  Arrived \(automatic, by GPS\) · 36 ft from the building · GPS ±8 m · 40\.851760, -73\.937602/);
assert.match(text, /9:20 AM  No access · 36 ft from the building/);
assert.match(text, /Mon 10\/05\/26 9:20 AM  No access · 2nd try: no access · 87 ft from the building/);
assert.doesNotMatch(text, /No access: 1st try/, 'the same moment is listed once');
assert.match(text, /PHOTOS AND VIDEOS \(1\)\n- Thu 10\/01\/26 9:18 AM  BEFORE photo/);
assert.ok(text.indexOf('On the way') < text.indexOf('Arrived') && text.indexOf('Arrived') < text.indexOf('2nd try'), 'in time order');
const empty = visitRecordText({ jobId: 'X1', address: '' }, {}, [], null, '2026-10-05T14:00:00Z');
assert.match(empty, /nothing saved on the phone/);
// Arriving and finding no access in the same minute: both are listed.
{
  const quick = visitRecordText({ jobId: 'ER1', address: '' }, { FieldArrivedAt: '2026-10-05T13:20:00Z', NoAccessFirstAttemptAt: '2026-10-05T13:20:30Z',
    FieldVisitHistory: [{ recordedAt: '2026-10-05T13:20:00Z', outcome: null, note: 'Arrived', latitude: 40.85176, longitude: -73.937602, feetFromJob: 36 },
      { recordedAt: '2026-10-05T13:20:30Z', outcome: 'NO_ACCESS_1_WAITING_72H', note: '' }] }, [], building);
  assert.match(quick, /TIMELINE \(2\)/, quick);
  assert.match(quick, /Arrived · 36 ft from the building/);
  assert.match(quick, /9:20 AM  No access\n/);
}
console.log('PASS visit record: GPS distance, fresh-fix rule, timeline in New York time, de-duplicated tries');
