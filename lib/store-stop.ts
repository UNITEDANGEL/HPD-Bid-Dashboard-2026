// 🛒 Store stop on the way (owner, 4 Nov, "you decide, build it"): the hardware / building-supply store that costs the
// fewest extra minutes between where you are and the next stop. Stores come from OpenStreetMap (Overpass, free, no key).
// Nothing is sent but two map points; returns null with no signal.

export type StorePoint = { lat: number; lng: number };
export type Store = { name: string; lat: number; lng: number; address: string; extraMin: number; big: boolean };

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const BIG = /home depot|lowe'?s|blue ?line|feldman|dykes|ace hardware|true value|janovic|kamco/i;

export function milesBetween(a: StorePoint, b: StorePoint) {
  const r = 3958.8, rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// City driving: the straight line x 1.35 for the streets, about 15 mph door to door.
export const driveMin = (a: StorePoint, b: StorePoint) => (milesBetween(a, b) * 1.35 / 15) * 60;

export function overpassQuery(from: StorePoint, to: StorePoint | null) {
  const mid = to ? { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 } : from;
  const radius = Math.round(Math.min(8000, Math.max(2500, (to ? milesBetween(from, to) * 1609 * 0.6 : 0) + 2000)));
  const around = `(around:${radius},${mid.lat.toFixed(5)},${mid.lng.toFixed(5)})`;
  return `[out:json][timeout:12];(nwr["shop"~"^(doityourself|hardware|trade)$"]${around};);out center 60;`;
}

// The best store: the fewest extra minutes; the big chains (more in stock) win a 4-minute tie.
export function pickStore(body: unknown, from: StorePoint, to: StorePoint | null): Store | null {
  const els = ((body as { elements?: unknown[] })?.elements || []) as { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
  const direct = to ? driveMin(from, to) : 0;
  const list = els.flatMap((e) => {
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon, tags = e.tags || {};
    const name = tags.name || tags.brand || "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) return [];
    const p = { lat: lat as number, lng: lng as number };
    const extra = Math.max(0, driveMin(from, p) + (to ? driveMin(p, to) - direct : 0)) + 10; // + about 10 min in the store's lot
    const address = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || tags["addr:full"] || "";
    const big = BIG.test(`${name} ${tags.brand || ""}`);
    return [{ name, lat: p.lat, lng: p.lng, address, extraMin: Math.round(extra), big, score: extra - (big ? 4 : 0) }];
  });
  list.sort((a, b) => a.score - b.score);
  const best = list[0];
  if (!best) return null;
  const { score: _s, ...store } = best; // eslint-disable-line @typescript-eslint/no-unused-vars
  return store;
}

export async function findStore(from: StorePoint, to: StorePoint | null, fetcher: typeof fetch = fetch, timeoutMs = 12000): Promise<Store | null> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const r = await fetcher(OVERPASS_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(overpassQuery(from, to))}`, ...(controller ? { signal: controller.signal } : {}) });
    if (!r.ok) return null;
    return pickStore(await r.json(), from, to);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function storeLine(s: Store) {
  return `🛒 ${s.name}${s.address ? `, ${s.address}` : ""}: about ${s.extraMin} min out of your way (with parking).`;
}
