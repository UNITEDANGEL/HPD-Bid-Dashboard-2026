"use client";
import { useState } from 'react';
import { APPOINTMENT_STATES, Appointment, appointmentConflicts, appointmentCalendar } from '../../lib/appointments';

export default function AppointmentEditor({ job, jobs, id, address, contact, phone, note, save }: { job: Record<string, unknown>; jobs: Record<string, unknown>[]; id: string; address: string; contact: string; phone: string; note: string; save: (a: Appointment) => void }) {
  const saved = job.Appointment as Appointment | undefined;
  const [draft, setDraft] = useState<Appointment>(saved || { date: '', start: '08:00', end: '09:00', state: 'requested', contact, phone, note, reminder: 30 });
  const [message, setMessage] = useState('');
  const set = (patch: Partial<Appointment>) => { setDraft(prev => ({ ...prev, ...patch })); setMessage(''); };
  const conflicts = appointmentConflicts(draft, jobs, id);
  return <div className="fc-appointment-editor">
    <h3>Appointment</h3>
    <p>New York time. Saved on this phone and sent to the status server; nothing is sent to the tenant.</p>
    <label>Status<select value={draft.state} onChange={e => set({ state: e.target.value as Appointment['state'] })}>{Object.entries(APPOINTMENT_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Date<input type="date" value={draft.date} onChange={e => set({ date: e.target.value })} /></label>
    <div className="fc-appointment-times"><label>From<input type="time" value={draft.start} onChange={e => set({ start: e.target.value })} /></label><label>Until<input type="time" value={draft.end} onChange={e => set({ end: e.target.value })} /></label></div>
    <label>Contact<input value={draft.contact} onChange={e => set({ contact: e.target.value })} /></label>
    <label>Phone<input type="tel" value={draft.phone} onChange={e => set({ phone: e.target.value })} /></label>
    <label>Appointment notes<textarea rows={2} value={draft.note} onChange={e => set({ note: e.target.value })} /></label>
    <label>Calendar reminder<select value={draft.reminder} onChange={e => set({ reminder: Number(e.target.value) })}><option value={0}>None</option><option value={15}>15 minutes before</option><option value={30}>30 minutes before</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option></select></label>
    {conflicts.length > 0 && <p role="alert">Overlaps {conflicts.length} other appointment(s) saved on this device. Check the time before saving.</p>}
    <button type="button" className="fc-next-action" onClick={() => { try { save(draft); setMessage('Appointment saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed. Your entries are still here.'); } }}>Save appointment</button>
    {saved?.state === 'confirmed' && <button type="button" className="fc-save-review" onClick={() => { try { const url = URL.createObjectURL(new Blob([appointmentCalendar(id, address, saved)], { type: 'text/calendar' })); const link = document.createElement('a'); link.href = url; link.download = `${id}-appointment.ics`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Calendar file downloaded. Import it into Calendar to enable the reminder.'); } catch (error) { setMessage(String(error)); } }}>Download saved appointment to Calendar</button>}
    <p role="status">{message}</p>
    {Array.isArray(job.AppointmentHistory) && <details><summary>Appointment history ({job.AppointmentHistory.length})</summary>{(job.AppointmentHistory as Appointment[]).map((a, index) => <p key={index}>{a.date} {a.start}-{a.end}: {APPOINTMENT_STATES[a.state]}<br />{a.note}</p>)}</details>}
  </div>;
}
