export type RouteJob = { id: string; address: string; borough: string; lat: number; lng: number; days: number | null; pending: boolean; closed: boolean; blocked?: boolean; appointment?: { date: string; start: string; end: string; state: string }; done?: { at: string; label: string }; contact?: { tone: "none" | "try" | "ok" | "common"; tries: number } };
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
  return jobs.filter(j => !j.closed && !j.blocked && Number.isFinite(j.lat) && Number.isFinite(j.lng) && Math.abs(j.lat)<=90 && Math.abs(j.lng)<=180 && !(j.lat===0 && j.lng===0) && (s.borough==='ALL' || j.borough===s.borough) &&
    (j.appointment && ['confirmed','requested'].includes(j.appointment.state)
      ? j.appointment.state==='confirmed' && j.appointment.date===s.date
      : j.pending));
}
// Minutes to park and walk in, added to real road driving time (the straight-line estimate already has it).
export const PARK_MINUTES = 5;
// driveMinutes: real road driving time to each stop, when a road route is known; otherwise estimated.
export function scheduleStops(jobs: RouteJob[], s: RouteSettings, origin: RoutePoint, driveMinutes?: number[]): RouteStop[] {
  if (!validRouteSettings(s)) return [];
  let cursor = timeMinutes(s.start), previous = origin;
  return jobs.map((job, index) => {
    const road = driveMinutes && driveMinutes.length === jobs.length ? driveMinutes[index] : undefined;
    const travel = Number.isFinite(road) ? Math.ceil(road as number) + PARK_MINUTES : travelEstimate(previous,job);
    const appointment = job.appointment?.state==='confirmed' && job.appointment.date===s.date ? job.appointment : undefined;
    const arrival = Math.max(cursor + travel, appointment ? timeMinutes(appointment.start) : 0);
    const finish = arrival + s.minutes;
    const warning = !Number.isFinite(arrival) || (appointment && !Number.isFinite(timeMinutes(appointment.end))) ? 'Invalid appointment time' : appointment && finish > timeMinutes(appointment.end) ? 'Appointment window conflict' : finish > timeMinutes(s.end) ? 'Beyond workday' : '';
    cursor = finish; previous = job;
    return {job,arrival,finish,travel,warning};
  });
}
// How much an overdue day is worth in minutes of driving when picking the next stop: a job 100 days
// more overdue is worth a 10-minute longer drive. Capped so very old jobs don't pull across the city.
const URGENCY_MINUTES_PER_DAY = 0.1;
const URGENCY_CAP_DAYS = 365;
function stopCost(from: RoutePoint, job: RouteJob) {
  return travelEstimate(from, job) - Math.min(URGENCY_CAP_DAYS, Math.max(0, job.days || 0)) * URGENCY_MINUTES_PER_DAY;
}

function legsTotal(start: RoutePoint, run: RouteJob[], end: RoutePoint | null) {
  let total = 0, previous = start;
  for (const job of run) { total += travelEstimate(previous, job); previous = job; }
  return end ? total + travelEstimate(previous, end) : total;
}

// 2-opt: reverse any stretch of the run that makes the drive shorter (no crossing back and forth).
function untangle(start: RoutePoint, run: RouteJob[], end: RoutePoint | null) {
  let best = run.slice(), bestTotal = legsTotal(start, best, end), improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const total = legsTotal(start, candidate, end);
        if (total < bestTotal - 0.01) { best = candidate; bestTotal = total; improved = true; }
      }
    }
  }
  return best;
}

// Confirmed appointments keep their times; the gaps fill with the most overdue work, taken in an order
// that keeps the drive short (next stop = best mix of nearby and overdue), then untangled.
export function planDay(jobs: RouteJob[], s: RouteSettings, origin: RoutePoint) {
  if (!validRouteSettings(s)) return [];
  const eligible = eligibleRouteJobs(jobs,s);
  const fixed = eligible.filter(j=>j.appointment?.state==='confirmed').sort((a,b)=>String(a.appointment?.start).localeCompare(String(b.appointment?.start)));
  const pending = eligible.filter(j=>!fixed.includes(j));
  const selected: RouteJob[] = [];
  let cursor = timeMinutes(s.start), previous: RoutePoint = origin;
  for (const next of [...fixed, null]) {
    const limit = next ? timeMinutes(next.appointment!.start) : timeMinutes(s.end);
    const runStart = previous, run: RouteJob[] = [];
    while (selected.length + run.length < 8) {
      const fits = pending.filter(j=>cursor+travelEstimate(previous,j)+s.minutes+(next?travelEstimate(j,next):0)<=limit);
      if (!fits.length) break;
      const job = fits.reduce((best,j)=>{const d=stopCost(previous,j)-stopCost(previous,best); return d<0||(d===0&&j.id<best.id)?j:best;});
      pending.splice(pending.indexOf(job),1); run.push(job);
      cursor += travelEstimate(previous,job)+s.minutes; previous=job;
    }
    const ordered = untangle(runStart, run, next);
    selected.push(...ordered);
    if (ordered.length) previous = ordered[ordered.length-1];
    if (next) {
      selected.push(next); cursor=Math.max(cursor+travelEstimate(previous,next),timeMinutes(next.appointment!.start))+s.minutes; previous=next;
    }
  }
  return selected;
}

// After finishing a job: the next stop on today's route that is still open (stop N of M). If the
// finished job isn't on the route (or everything after it is done), the route's first open stop.
// null when the route has no open stop left.
export function nextRouteStop(routeIds: string[], finishedId: string, isOpen: (id: string) => boolean) {
  const open = (id: string) => id !== finishedId && isOpen(id);
  const at = routeIds.indexOf(finishedId);
  const id = (at >= 0 ? routeIds.slice(at + 1).find(open) : undefined) ?? routeIds.find(open);
  if (!id) return null;
  return { id, stop: routeIds.indexOf(id) + 1, of: routeIds.length, left: routeIds.filter(open).length };
}
