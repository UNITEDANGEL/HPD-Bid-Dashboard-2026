export type RouteJob = { id: string; address: string; borough: string; lat: number; lng: number; days: number | null; pending: boolean; closed: boolean; appointment?: { date: string; start: string; end: string; state: string } };
export type RoutePoint = { lat: number; lng: number };
export type RouteSettings = { date: string; start: string; end: string; minutes: number; borough: string };
export type RouteStop = { job: RouteJob; arrival: number; finish: number; travel: number; warning: string };
export function timeMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [h,m] = value.split(':').map(Number); return h * 60 + m;
}
export function routeTime(minutes: number) {
  if (!Number.isFinite(minutes)) return 'Unavailable';
  return `${Math.floor(minutes / 60).toString().padStart(2,'0')}:${(minutes % 60).toString().padStart(2,'0')}`;
}
export function validRouteSettings(s: RouteSettings) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(Date.parse(s.date)) && new Date(s.date).toISOString().slice(0,10) === s.date && timeMinutes(s.end) > timeMinutes(s.start) && Number.isInteger(s.minutes) && s.minutes >= 15 && s.minutes <= 240;
}
export function travelEstimate(a: RoutePoint, b: RoutePoint) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return Math.ceil(3959 * 2 * Math.asin(Math.sqrt(Math.min(1,h))) / 15 * 60) + 5;
}
export function eligibleRouteJobs(jobs: RouteJob[], s: RouteSettings) {
  return jobs.filter(j => !j.closed && Number.isFinite(j.lat) && Number.isFinite(j.lng) && Math.abs(j.lat)<=90 && Math.abs(j.lng)<=180 && !(j.lat===0 && j.lng===0) && (s.borough==='ALL' || j.borough===s.borough) &&
    (j.appointment && ['confirmed','requested'].includes(j.appointment.state)
      ? j.appointment.state==='confirmed' && j.appointment.date===s.date
      : j.pending));
}
export function scheduleStops(jobs: RouteJob[], s: RouteSettings, origin: RoutePoint): RouteStop[] {
  if (!validRouteSettings(s)) return [];
  let cursor = timeMinutes(s.start), previous = origin;
  return jobs.map(job => {
    const travel = travelEstimate(previous,job);
    const appointment = job.appointment?.state==='confirmed' && job.appointment.date===s.date ? job.appointment : undefined;
    const arrival = Math.max(cursor + travel, appointment ? timeMinutes(appointment.start) : 0);
    const finish = arrival + s.minutes;
    const warning = !Number.isFinite(arrival) || (appointment && !Number.isFinite(timeMinutes(appointment.end))) ? 'Invalid appointment time' : appointment && finish > timeMinutes(appointment.end) ? 'Appointment window conflict' : finish > timeMinutes(s.end) ? 'Beyond workday' : '';
    cursor = finish; previous = job;
    return {job,arrival,finish,travel,warning};
  });
}
export function planDay(jobs: RouteJob[], s: RouteSettings, origin: RoutePoint) {
  if (!validRouteSettings(s)) return [];
  const eligible = eligibleRouteJobs(jobs,s);
  const fixed = eligible.filter(j=>j.appointment?.state==='confirmed').sort((a,b)=>String(a.appointment?.start).localeCompare(String(b.appointment?.start)));
  const pending = eligible.filter(j=>!fixed.includes(j)).sort((a,b)=>Math.max(0,b.days||0)-Math.max(0,a.days||0) || travelEstimate(origin,a)-travelEstimate(origin,b) || a.id.localeCompare(b.id));
  const selected: RouteJob[] = [];
  let cursor = timeMinutes(s.start), previous = origin;
  // Reserve confirmed appointments first, then fill available gaps with overdue work.
  for (const next of [...fixed, null]) {
    const limit = next ? timeMinutes(next.appointment!.start) : timeMinutes(s.end);
    while (selected.length < 8) {
      const index = pending.findIndex(j=>cursor+travelEstimate(previous,j)+s.minutes+(next?travelEstimate(j,next):0)<=limit);
      if (index<0) break;
      const job = pending.splice(index,1)[0]; selected.push(job);
      cursor += travelEstimate(previous,job)+s.minutes; previous=job;
    }
    if (next) {
      selected.push(next); cursor=Math.max(cursor+travelEstimate(previous,next),timeMinutes(next.appointment!.start))+s.minutes; previous=next;
    }
  }
  return selected;
}
