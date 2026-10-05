export const APPOINTMENT_STATES = { requested: "Appointment requested", confirmed: "Appointment confirmed", cancelled: "Appointment cancelled", missed: "Appointment missed" };
export type Appointment = { date: string; start: string; end: string; state: keyof typeof APPOINTMENT_STATES; contact: string; phone: string; note: string; reminder: number; updatedAt?: string };

export function nyToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)?.value).join('-');
}

export function validateAppointment(a: Appointment, today = nyToday()) {
  if (!Object.hasOwn(APPOINTMENT_STATES, a.state)) throw new Error('Choose an appointment status.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !Number.isFinite(Date.parse(a.date)) || new Date(a.date).toISOString().slice(0, 10) !== a.date) throw new Error('Enter a valid appointment date.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.end) || a.end <= a.start) throw new Error('End time must be after start time on the same day.');
  if (['requested', 'confirmed'].includes(a.state) && a.date < today) throw new Error('Choose today or a future date.');
  if (![0, 15, 30, 60, 1440].includes(a.reminder)) throw new Error('Choose a valid reminder.');
  if (!a.contact.trim()) throw new Error('Enter the appointment contact.');
  // Check both New York offsets; reject missing or ambiguous DST wall times.
  for (const time of [a.start, a.end]) {
    const matches = [4, 5].filter(offset => {
      const instant = new Date(`${a.date}T${time}:00Z`).getTime() + offset * 3600000;
      const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));
      return nyToday(new Date(instant)) === a.date && local === time;
    });
    if (matches.length !== 1) throw new Error('This time changes with daylight saving. Choose a different time.');
  }
}

export function appointmentPatch(job: Record<string, unknown>, a: Appointment, now = new Date().toISOString()) {
  validateAppointment(a, nyToday(new Date(now)));
  const appointment = { ...a, contact: a.contact.trim(), phone: a.phone.trim(), note: a.note.trim(), updatedAt: now };
  const history = Array.isArray(job.AppointmentHistory) ? job.AppointmentHistory : [];
  const visits = Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : [];
  const code = `APPOINTMENT_${a.state.toUpperCase()}`;
  return { Appointment: appointment, AppointmentHistory: [...history, appointment],
    FieldVisitHistory: [...visits, { recordedAt: now, outcome: code, note: `${a.date} ${a.start}-${a.end} America/New_York. ${appointment.note}` }],
    WorkflowStatus: code, FieldOutcome: code, StatusOverride: APPOINTMENT_STATES[a.state], status: APPOINTMENT_STATES[a.state] };
}

export function appointmentConflicts(a: Appointment, jobs: Record<string, unknown>[], id: string) {
  if (!['requested', 'confirmed'].includes(a.state)) return [];
  return jobs.filter(job => {
    const other = job.Appointment as Appointment | undefined;
    const otherId = String(job.OMO || job.OMO_Number || job.id || '');
    return otherId !== id && other && ['requested', 'confirmed'].includes(other.state) && other.date === a.date && a.start < other.end && a.end > other.start;
  });
}

export function appointmentCalendar(id: string, address: string, a: Appointment) {
  validateAppointment(a);
  if (a.state !== 'confirmed') throw new Error('Confirm the appointment before adding it to your calendar.');
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = (s: string) => `${a.date.replaceAll('-', '')}T${s.replace(':', '')}00`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//United Angel//HPD App//EN', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(id)}-${a.date}@hpd-field`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z')}`,
    `DTSTART;TZID=America/New_York:${stamp(a.start)}`, `DTEND;TZID=America/New_York:${stamp(a.end)}`,
    `SUMMARY:${escape(`HPD ${id}`)}`, `LOCATION:${escape(address)}`, `DESCRIPTION:${escape(`${a.contact}\n${a.phone}\n${a.note}`)}`,
    ...(a.reminder ? ['BEGIN:VALARM', `TRIGGER:-PT${a.reminder}M`, 'ACTION:DISPLAY', 'DESCRIPTION:HPD appointment', 'END:VALARM'] : []),
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

const NY_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function clock(time: string) {
  const [h, m] = time.split(':').map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

// "Tue 10/07 · 2–3 PM" (New York time).
export function appointmentLabel(a: Appointment) {
  const [y, mo, d] = a.date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const start = clock(a.start), end = clock(a.end);
  const range = start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`;
  return `${weekday} ${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')} · ${range}`;
}

export function activeAppointment(job: Record<string, unknown>) {
  const a = job.Appointment as Appointment | undefined;
  return a && typeof a === 'object' && ['requested', 'confirmed'].includes(a.state) && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && /^\d\d:\d\d$/.test(a.start) ? a : null;
}

// Where an appointment stands right now, in New York time: minutes until it starts and ends.
// soon: starts within 2 hours (or is under way); today: on today's date; past: already over.
export function appointmentTiming(a: Appointment, now = new Date()) {
  const parts = Object.fromEntries(NY_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const dayMs = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const dayDiff = Math.round((dayMs(a.date) - dayMs(today)) / 86_400_000);
  const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const startsIn = dayDiff * 1440 + toMinutes(a.start) - nowMinutes;
  const endsIn = dayDiff * 1440 + toMinutes(a.end || a.start) - nowMinutes;
  return { startsIn, endsIn, today: dayDiff === 0, past: endsIn < 0, soon: endsIn >= 0 && startsIn <= 120, days: dayDiff };
}
