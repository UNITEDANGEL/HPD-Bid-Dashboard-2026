// After a visit is finished: the closest open job, so the next stop is one tap away.
export type JobSpot = { id: string; lat: number; lng: number; open: boolean };

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Closest open job to `from` (where you are, or the job you just finished), not the job itself.
// Jobs at the same building (within ~100 ft) come first, since there is no driving to them.
export function nextJob(spots: JobSpot[], currentId: string, from: { lat: number; lng: number }) {
  let best: { id: string; miles: number } | null = null;
  for (const spot of spots) {
    if (!spot.open || spot.id === currentId || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) continue;
    const miles = milesBetween(from, spot);
    if (!best || miles < best.miles) best = { id: spot.id, miles };
  }
  return best;
}

export function milesLabel(miles: number) {
  if (miles < 0.02) return "same building";
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft away`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}
