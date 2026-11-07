// ⏰ Job is taking long (idea list: "if you are on a job much longer than your usual time, the robot asks if you want to
// text the next tenant that you are running late"). Your usual: what the app learned for this building / kind of work
// (lib/learned-time), else the middle of all your timed visits (3+), else an hour. Long = half again your usual and at
// least 20 minutes over.
export function usualMinutes(learned: number | null | undefined, allTimed: number[]) {
  if (learned && learned > 0) return learned;
  if (allTimed.length >= 3) { const s = [...allTimed].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); }
  return 60;
}
export function takingLong(arrivedAt: string, usual: number, now = Date.now()) {
  const t = Date.parse(arrivedAt);
  if (!Number.isFinite(t) || !(usual > 0)) return null;
  const elapsed = Math.round((now - t) / 60000);
  if (elapsed > 600) return null; // a stale "I'm here" from another day
  return elapsed >= usual * 1.5 && elapsed - usual >= 20 ? { elapsed, usual } : null;
}
// The next stop on today's route after this one that isn't finished.
export function nextOpenStop(routeIds: string[], hereId: string, isOpen: (id: string) => boolean) {
  const i = routeIds.indexOf(hereId);
  return routeIds.slice(i + 1).find((id) => id !== hereId && isOpen(id)) || "";
}
