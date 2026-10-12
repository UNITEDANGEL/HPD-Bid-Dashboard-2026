// Road route for Today's route: the streets to drive between the stops, with real driving time and
// miles for each leg, from OSRM (OpenStreetMap routing, the same map data as the field map).
// Returns null with no signal or on any error, and the map falls back to straight stop-to-stop lines.

export type LatLng = { lat: number; lng: number };
export type RoadLeg = { minutes: number; miles: number; path: [number, number][] };
export type RoadRoute = { legs: RoadLeg[]; miles: number; minutes: number; path: [number, number][] };

export const ROAD_ROUTE_SERVICE = "https://router.project-osrm.org/route/v1/driving/";
const METERS_PER_MILE = 1609.344;
const cache = new Map<string, RoadRoute>();

export function roadRouteUrl(points: LatLng[]) {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  return `${ROAD_ROUTE_SERVICE}${coords}?overview=full&geometries=geojson&steps=false`;
}

function nearestIndex(path: [number, number][], target: [number, number], from: number) {
  let best = from, bestDistance = Infinity;
  for (let i = from; i < path.length; i++) {
    const d = (path[i][0] - target[0]) ** 2 + (path[i][1] - target[1]) ** 2;
    if (d < bestDistance) { best = i; bestDistance = d; }
  }
  return best;
}

// Turns an OSRM response into one street path per leg (stop to stop), in [lat, lng] order.
export function parseRoadRoute(body: unknown, stops: number): RoadRoute | null {
  const data = body as { code?: string; routes?: any[]; waypoints?: any[] };
  const route = data?.code === "Ok" ? data.routes?.[0] : null;
  const coords = route?.geometry?.coordinates;
  if (!route || !Array.isArray(coords) || coords.length < 2 || !Array.isArray(route.legs) || route.legs.length !== stops - 1) return null;
  const path = coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
  // Cut the full line at each stop (OSRM's snapped waypoint) so every leg has its own piece.
  const cuts = [0];
  for (let i = 1; i < stops - 1; i++) {
    const wp = data.waypoints?.[i]?.location;
    cuts.push(Array.isArray(wp) ? nearestIndex(path, [wp[1], wp[0]], cuts[i - 1]) : cuts[i - 1]);
  }
  cuts.push(path.length - 1);
  const legs = route.legs.map((leg: { duration: number; distance: number }, i: number) => ({
    minutes: Math.max(1, Math.round(Number(leg.duration) / 60)),
    miles: Number(leg.distance) / METERS_PER_MILE,
    path: path.slice(cuts[i], cuts[i + 1] + 1),
  }));
  return { legs, path, miles: Number(route.distance) / METERS_PER_MILE, minutes: Math.round(Number(route.duration) / 60) };
}

export async function fetchRoadRoute(points: LatLng[], fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<RoadRoute | null> {
  if (points.length < 2 || points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) return null;
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  const known = cache.get(key);
  if (known) return known;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetcher(roadRouteUrl(points), controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return null;
    const route = parseRoadRoute(await response.json(), points.length);
    if (route) cache.set(key, route);
    return route;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
