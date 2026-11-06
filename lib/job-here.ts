// 📍 "The job here" (plan item 21): "this job", "the job here", "this building" = the job you're standing at, by the
// phone's location, so the job number isn't needed.

export type Fix = { lat: number; lng: number; accuracy?: number; at?: number };
export type Spot = { id: string; lat: number; lng: number };

export const saysHere = (t: string) => /\b(?:the job here|job here|this job|this building|this address|this place|this apartment|this house|the job i'?m at|where i am|right here|the one here)\b/i.test(String(t || ""));

const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// The nearest job within reach (200 m, more when the phone's location is rough); null when none, or the location is
// older than 10 minutes.
export function jobHere(fix: Fix | null, spots: Spot[], now = Date.now()): { id: string; meters: number } | null {
  if (!fix || !fix.at || now - fix.at > 600000) return null;
  const reach = Math.max(200, Math.min(400, (fix.accuracy || 0) * 1.5));
  let best: { id: string; meters: number } | null = null;
  for (const s of spots) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const m = meters(fix, s);
    if (m <= reach && (!best || m < best.meters)) best = { id: s.id, meters: Math.round(m) };
  }
  return best;
}
