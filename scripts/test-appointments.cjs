const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/appointments.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { validateAppointment, appointmentPatch, appointmentConflicts, appointmentCalendar, nyToday } = mod.exports;
const a = { date: '2099-09-30', start: '08:00', end: '10:00', state: 'requested', contact: 'Test tenant', phone: '555', note: 'Test note', reminder: 30 };
validateAppointment(a);
for (const patch of [{ date: '2099-02-30' }, { date: '2001-01-01' }, { start: '24:00' }, { end: '07:00' }, { end: '08:00' }, { contact: ' ' }, { state: 'bad' }, { reminder: -1 }]) assert.throws(() => validateAppointment({ ...a, ...patch }));
assert.equal(nyToday(new Date('2026-09-29T02:00:00Z')), '2026-09-28');
assert.throws(() => validateAppointment({ ...a, date: '2027-03-14', start: '02:30', end: '04:00' }, '2027-01-01'));
assert.throws(() => validateAppointment({ ...a, date: '2027-11-07', start: '01:30', end: '04:00' }, '2027-01-01'));
const job = { AwardDate: '2026-08-28', MaturityDate: '2026-09-01', FieldVisitHistory: [{ note: 'keep' }], AppointmentHistory: [{ note: 'previous' }] };
const patch = appointmentPatch(job, a);
assert.equal(patch.WorkflowStatus, 'APPOINTMENT_REQUESTED');
assert.equal(patch.FieldVisitHistory.length, 2);
assert.equal(patch.AppointmentHistory.length, 2);
assert.equal(job.FieldVisitHistory.length, 1);
for (const key of ['AwardDate', 'MaturityDate', 'archived', 'ActualWorkCompletionDate']) assert.equal(patch[key], undefined);
assert.equal(appointmentConflicts(a, [{ id: 'other', Appointment: a }, { id: 'self', Appointment: a }, { id: 'later', Appointment: { ...a, start: '10:00', end: '11:00' } }, { id: 'cancelled', Appointment: { ...a, state: 'cancelled' } }], 'self').length, 1);
assert.throws(() => appointmentCalendar('TEST', 'Address', a));
const ics = appointmentCalendar('TEST', 'Address', { ...a, state: 'confirmed', note: 'line1\nline2, semicolon;' });
assert.match(ics, /DTSTART;TZID=America\/New_York:20990930T080000/);
assert.match(ics, /TRIGGER:-PT30M/);
assert.match(ics, /line1\\nline2\\, semicolon\\;/);
assert.doesNotMatch(appointmentCalendar('TEST', 'Address', { ...a, state: 'confirmed', reminder: 0 }), /VALARM/);
assert.equal(appointmentPatch(job, { ...a, state: 'cancelled' }).WorkflowStatus, 'APPOINTMENT_CANCELLED');
{
  const { appointmentLabel, appointmentTiming, activeAppointment } = mod.exports;
  const visit = { ...a, date: '2026-10-06', start: '14:00', end: '15:00' };
  assert.equal(appointmentLabel(visit), 'Tue 10/06 · 2–3 PM');
  assert.equal(appointmentLabel({ ...visit, start: '11:30', end: '12:30' }), 'Tue 10/06 · 11:30 AM–12:30 PM');
  // 1:00 PM New York (EDT = UTC-4) on the day: starts in 60 minutes -> soon.
  let t = appointmentTiming(visit, new Date('2026-10-06T17:00:00Z'));
  assert.deepEqual([t.startsIn, t.today, t.soon, t.past], [60, true, true, false]);
  t = appointmentTiming(visit, new Date('2026-10-06T13:00:00Z')); // 9 AM: today, not soon yet
  assert.deepEqual([t.startsIn, t.today, t.soon], [300, true, false]);
  t = appointmentTiming(visit, new Date('2026-10-06T18:30:00Z')); // 2:30 PM: under way -> soon
  assert.equal(t.soon, true);
  t = appointmentTiming(visit, new Date('2026-10-06T19:30:00Z')); // 3:30 PM: over
  assert.deepEqual([t.past, t.soon], [true, false]);
  t = appointmentTiming(visit, new Date('2026-10-05T18:00:00Z')); // the day before
  assert.deepEqual([t.days, t.today, t.soon], [1, false, false]);
  assert.equal(activeAppointment({ Appointment: visit }), visit);
  assert.equal(activeAppointment({ Appointment: { ...visit, state: 'cancelled' } }), null);
}
console.log('PASS: appointment validation, NY dates, overlap boundaries, history preservation, status separation and calendar reminders');
