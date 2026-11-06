// 🧭 Next stop (plan item 31; owner, 6 Nov: "since we're working at this job, guide us to the next location and what
// the next job is all about, let's prepare that step"). The nearest open job from where you are (or the job you're
// at): how far, about how long by car, and the work in a few words. Appointments today come first when they're due.

import { etaMinutes } from "./on-my-way";

export type StopJob = { id: string; lat: number; lng: number; address: string; work: string; open: boolean; appointmentToday?: boolean };

const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// The work in a few words: the first line of HPD's description, without the HPD boilerplate.
export function workInWords(text: string) {
  const t = String(text || "").replace(/\s+/g, " ").replace(/^[:\s]+/, "")
    .trim();
  const first = t.split(/\s+[-–]\s+|\.\s|:\s|\*\*|\s*NYC HPD/i)[0].trim();
  return (first.length > 70 ? `${first.slice(0, 70).replace(/\s+\S*$/, "")}…` : first).toLowerCase();
}

export function nextStop(from: { lat: number; lng: number }, jobs: StopJob[], exceptId = "", now = new Date()) {
  const open = jobs.filter((j) => j.open && j.id !== exceptId && Number.isFinite(j.lat) && Number.isFinite(j.lng));
  if (!open.length) return null;
  const scored = open.map((j) => ({ j, mi: miles(from, j) })).sort((a, b) => ((b.j.appointmentToday ? 1 : 0) - (a.j.appointmentToday ? 1 : 0)) || a.mi - b.mi);
  const best = scored[0];
  return { id: best.j.id, address: best.j.address, miles: Math.round(best.mi * 10) / 10, minutes: etaMinutes(from, best.j, now), work: workInWords(best.j.work), appointment: Boolean(best.j.appointmentToday) };
}

export function nextStopLine(s: NonNullable<ReturnType<typeof nextStop>>) {
  const where = s.address.replace(/,\s*\d{5}$/, "");
  return `🧭 Next stop: ${s.id}, ${where}${s.appointment ? " (appointment today)" : ""}: ${s.miles} mi, about ${s.minutes} min.${s.work ? ` The work: ${s.work}.` : ""}`;
}
