"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type LngLat = [number, number];
type JobRecord = Record<string, unknown>;
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[] };
type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapboxLike = {
  getContainer: () => HTMLElement;
  unproject: (point: [number, number] | { x: number; y: number }) => { lng: number; lat: number };
  getSource: (id: string) => GeoJsonSourceLike | undefined;
  addSource: (id: string, source: unknown) => void;
  getLayer: (id: string) => unknown;
  addLayer: (layer: unknown) => void;
  setPaintProperty?: (layer: string, property: string, value: unknown) => void;
  isStyleLoaded?: () => boolean;
};
type LeafletLike = {
  getContainer: () => HTMLElement;
  containerPointToLatLng: (point: [number, number]) => { lng: number; lat: number };
  fitBounds?: (bounds: unknown, options?: unknown) => void;
};

type OsrmResponse = { code?: string; routes?: Array<{ geometry?: { coordinates?: LngLat[] } }> };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;
const ROUTER = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_SOURCE = "hpd-anchored-road-route";
const STOP_SOURCE = "hpd-anchored-road-stops";
const CASING_LAYER = "hpd-anchored-road-casing";
const LINE_LAYER = "hpd-anchored-road-line";
const MOTION_LAYER = "hpd-anchored-road-motion";
const STOP_CIRCLE_LAYER = "hpd-anchored-stop-circles";
const STOP_LABEL_LAYER = "hpd-anchored-stop-labels";
const BASE_COORDS: LngLat = [-73.8357, 40.6992];

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstValue(record: JobRecord, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return "";
}

const FALLBACK_COORDS = new Map<string, LngLat>();
for (const record of bundledJobsData as JobRecord[]) {
  const id = firstValue(record, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  const lat = Number(record.Latitude ?? record.latitude ?? record.lat);
  const lng = Number(record.Longitude ?? record.longitude ?? record.lng ?? record.lon);
  if (id && Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) FALLBACK_COORDS.set(id, [lng, lat]);
}

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function orderedIds() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
  const fromRows = rows
    .map((row) => textOf(row).match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "")
    .filter(Boolean);
  if (fromRows.length) return Array.from(new Set(fromRows)).slice(0, 6);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as SavedWorkflow) : {};
    const ids = saved.routeIds?.length ? saved.routeIds : saved.resultIds || [];
    return Array.from(new Set(ids.map((id) => id.toUpperCase()))).slice(0, 6);
  } catch {
    return [];
  }
}

function markerIdentity(marker: HTMLElement) {
  return [
    marker.dataset.omo,
    marker.dataset.jobId,
    marker.dataset.id,
    marker.getAttribute("aria-label"),
    marker.getAttribute("title"),
    textOf(marker),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function markerFor(id: string) {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".maturity-map-marker, [data-omo], [data-job-id], .maplibregl-marker, .mapboxgl-marker, .leaflet-marker-icon",
    ),
  );
  return candidates.find((marker) => markerIdentity(marker).includes(id.toUpperCase())) || null;
}

function isMapboxLike(value: unknown): value is MapboxLike {
  const map = value as Partial<MapboxLike> | null;
  return Boolean(
    map &&
      typeof map.getContainer === "function" &&
      typeof map.unproject === "function" &&
      typeof map.getSource === "function" &&
      typeof map.addSource === "function" &&
      typeof map.getLayer === "function" &&
      typeof map.addLayer === "function",
  );
}

function isLeafletLike(value: unknown): value is LeafletLike {
  const map = value as Partial<LeafletLike> | null;
  return Boolean(map && typeof map.getContainer === "function" && typeof map.containerPointToLatLng === "function");
}

function searchObject(root: unknown, maxDepth = 14): MapboxLike | LeafletLike | null {
  const seen = new WeakSet<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  while (queue.length) {
    const { value, depth } = queue.shift()!;
    if (isMapboxLike(value) || isLeafletLike(value)) return value;
    if (!value || (typeof value !== "object" && typeof value !== "function") || depth >= maxDepth) continue;
    const object = value as object;
    if (seen.has(object)) continue;
    seen.add(object);
    let keys: PropertyKey[] = [];
    try {
      keys = Reflect.ownKeys(object);
    } catch {
      continue;
    }
    for (const key of keys.slice(0, 400)) {
      try {
        const child = (object as unknown as Record<PropertyKey, unknown>)[key];
        if (child && (typeof child === "object" || typeof child === "function")) queue.push({ value: child, depth: depth + 1 });
      } catch {
        // Ignore inaccessible framework internals.
      }
    }
  }
  return null;
}

function findLiveMap() {
  const globalCandidate = (window as unknown as Record<string, unknown>).__HPD_MAP__;
  if (isMapboxLike(globalCandidate) || isLeafletLike(globalCandidate)) return globalCandidate;

  const roots = Array.from(document.querySelectorAll<HTMLElement>(".map-shell, .maplibregl-map, .mapboxgl-map, .leaflet-container, canvas"));
  for (const root of roots) {
    for (const key of Reflect.ownKeys(root)) {
      try {
        const found = searchObject((root as unknown as Record<PropertyKey, unknown>)[key]);
        if (found) return found;
      } catch {
        // Continue searching.
      }
    }
  }
  return null;
}

function coordFromRenderedMarker(id: string, map: MapboxLike | LeafletLike): LngLat | null {
  const marker = markerFor(id);
  if (!marker) return null;
  const markerRect = marker.getBoundingClientRect();
  const containerRect = map.getContainer().getBoundingClientRect();
  if ((!markerRect.width && !markerRect.height) || !containerRect.width || !containerRect.height) return null;
  const x = markerRect.left - containerRect.left + markerRect.width / 2;
  const y = markerRect.top - containerRect.top + markerRect.height / 2;
  try {
    const result = isMapboxLike(map) ? map.unproject([x, y]) : map.containerPointToLatLng([x, y]);
    if (!Number.isFinite(result.lng) || !Number.isFinite(result.lat)) return null;
    return [result.lng, result.lat];
  } catch {
    return null;
  }
}

function currentLocation(): Promise<LngLat> {
  if (!navigator.geolocation) return Promise.resolve(BASE_COORDS);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => resolve(BASE_COORDS),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 8_000 },
    );
  });
}

async function routedGeometry(coords: LngLat[], signal: AbortSignal) {
  const path = coords.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const response = await fetch(`${ROUTER}/${path}?overview=full&geometries=geojson&steps=false&continue_straight=false`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
  const data = (await response.json()) as OsrmResponse;
  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (data.code !== "Ok" || !coordinates?.length) throw new Error("No route geometry returned");
  return coordinates;
}

function setSourceData(map: MapboxLike, id: string, data: unknown, options: Record<string, unknown> = {}) {
  const existing = map.getSource(id);
  if (existing) existing.setData(data);
  else map.addSource(id, { type: "geojson", data, ...options });
}

function ensureMapboxLayers(map: MapboxLike) {
  if (!map.getLayer(CASING_LAYER)) map.addLayer({ id: CASING_LAYER, type: "line", source: ROUTE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "rgba(255,255,255,0.98)", "line-width": 11 } });
  if (!map.getLayer(LINE_LAYER)) map.addLayer({ id: LINE_LAYER, type: "line", source: ROUTE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#006cff", "line-width": 6.5 } });
  if (!map.getLayer(MOTION_LAYER)) map.addLayer({ id: MOTION_LAYER, type: "line", source: ROUTE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 8, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,255,255,0)", 0.08, "rgba(220,248,255,1)", 0.16, "rgba(255,255,255,0)"] } });
  if (!map.getLayer(STOP_CIRCLE_LAYER)) map.addLayer({ id: STOP_CIRCLE_LAYER, type: "circle", source: STOP_SOURCE, paint: { "circle-radius": 12, "circle-color": "#006cff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  if (!map.getLayer(STOP_LABEL_LAYER)) map.addLayer({ id: STOP_LABEL_LAYER, type: "symbol", source: STOP_SOURCE, layout: { "text-field": ["get", "label"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,0.5)", "text-halo-width": 1 } });
}

export default function MapMarkerAnchoredRoute() {
  useEffect(() => {
    let destroyed = false;
    let map: MapboxLike | LeafletLike | null = null;
    let routeKey = "";
    let controller: AbortController | null = null;
    let animationFrame = 0;
    let leafletRoute: { remove?: () => void } | null = null;
    let leafletStops: Array<{ remove?: () => void }> = [];
    const animationStart = performance.now();

    const renderRoute = async () => {
      if (destroyed) return;
      map = map || findLiveMap();
      if (!map) return;
      if (isMapboxLike(map) && map.isStyleLoaded && !map.isStyleLoaded()) return;

      const ids = orderedIds();
      const stops = ids
        .map((id) => ({ id, coord: coordFromRenderedMarker(id, map!) || FALLBACK_COORDS.get(id) }))
        .filter((item): item is { id: string; coord: LngLat } => Boolean(item.coord));
      const nextKey = stops.map((stop) => `${stop.id}:${stop.coord[0].toFixed(5)},${stop.coord[1].toFixed(5)}`).join("|");
      if (!stops.length || nextKey === routeKey) return;

      controller?.abort();
      controller = new AbortController();
      try {
        const origin = await currentLocation();
        const coordinates = await routedGeometry([origin, ...stops.map((stop) => stop.coord)], controller.signal);
        if (destroyed) return;

        if (isMapboxLike(map)) {
          setSourceData(map, ROUTE_SOURCE, { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }, { lineMetrics: true });
          setSourceData(map, STOP_SOURCE, { type: "FeatureCollection", features: stops.map((stop, index) => ({ type: "Feature", properties: { label: String(index + 1), id: stop.id }, geometry: { type: "Point", coordinates: stop.coord } })) });
          ensureMapboxLayers(map);
        } else {
          const L = await import("leaflet");
          leafletRoute?.remove?.();
          leafletStops.forEach((item) => item.remove?.());
          leafletStops = [];
          leafletRoute = L.polyline(coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), { color: "#006cff", weight: 7, opacity: 0.96 }).addTo(map as never);
          leafletStops = stops.map((stop, index) => L.marker([stop.coord[1], stop.coord[0]], { icon: L.divIcon({ className: "hpd-anchored-route-stop", html: `<span>${index + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map as never));
        }

        routeKey = nextKey;
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("HPD marker-anchored route unavailable", error);
      }
    };

    const animate = () => {
      if (destroyed) return;
      if (map && isMapboxLike(map) && map.setPaintProperty && map.getLayer(MOTION_LAYER)) {
        const phase = ((performance.now() - animationStart) % 4200) / 4200;
        const a = Math.max(0, phase - 0.055);
        const c = Math.min(1, phase + 0.055);
        map.setPaintProperty(MOTION_LAYER, "line-gradient", ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,255,255,0)", a, "rgba(255,255,255,0)", phase, "rgba(220,248,255,1)", c, "rgba(255,255,255,0)", 1, "rgba(255,255,255,0)"]);
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const timer = window.setInterval(() => void renderRoute(), 450);
    const forceRefresh = () => {
      routeKey = "";
      window.setTimeout(() => void renderRoute(), 80);
      window.setTimeout(() => void renderRoute(), 350);
    };
    document.addEventListener("click", forceRefresh, true);
    window.addEventListener("storage", forceRefresh);
    void renderRoute();
    animationFrame = requestAnimationFrame(animate);

    return () => {
      destroyed = true;
      controller?.abort();
      window.clearInterval(timer);
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("click", forceRefresh, true);
      window.removeEventListener("storage", forceRefresh);
      leafletRoute?.remove?.();
      leafletStops.forEach((item) => item.remove?.());
    };
  }, []);

  return null;
}
