"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type LngLat = [number, number];
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[] };
type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapLike = {
  loaded?: () => boolean;
  isStyleLoaded?: () => boolean;
  getSource: (id: string) => GeoJsonSourceLike | undefined;
  addSource: (id: string, source: unknown) => void;
  removeSource?: (id: string) => void;
  getLayer: (id: string) => unknown;
  addLayer: (layer: unknown) => void;
  removeLayer?: (id: string) => void;
  setPaintProperty?: (layer: string, property: string, value: unknown) => void;
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
};

type OsrmResponse = { code?: string; routes?: Array<{ geometry?: { coordinates?: LngLat[] } }> };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const ROUTER = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_SOURCE = "hpd-workflow-road-route";
const STOP_SOURCE = "hpd-workflow-road-stops";
const CASING_LAYER = "hpd-workflow-road-casing";
const LINE_LAYER = "hpd-workflow-road-line";
const MOTION_LAYER = "hpd-workflow-road-motion";
const STOP_CIRCLE_LAYER = "hpd-workflow-stop-circles";
const STOP_LABEL_LAYER = "hpd-workflow-stop-labels";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;
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

const JOB_COORDS = new Map<string, LngLat>();
for (const record of bundledJobsData as JobRecord[]) {
  const id = firstValue(record, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  const lat = Number(record.Latitude ?? record.latitude ?? record.lat);
  const lng = Number(record.Longitude ?? record.longitude ?? record.lng ?? record.lon);
  if (id && Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) JOB_COORDS.set(id, [lng, lat]);
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
  const response = await fetch(`${ROUTER}/${path}?overview=full&geometries=geojson&steps=false`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
  const data = (await response.json()) as OsrmResponse;
  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (data.code !== "Ok" || !coordinates?.length) throw new Error("No route geometry returned");
  return coordinates;
}

function isMapLike(value: unknown): value is MapLike {
  const map = value as Partial<MapLike> | null;
  return Boolean(map && typeof map.getSource === "function" && typeof map.addSource === "function" && typeof map.getLayer === "function" && typeof map.addLayer === "function");
}

function searchObject(root: unknown, maxDepth = 8): MapLike | null {
  const seen = new WeakSet<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  while (queue.length) {
    const { value, depth } = queue.shift()!;
    if (isMapLike(value)) return value;
    if (!value || typeof value !== "object" || depth >= maxDepth) continue;
    const object = value as object;
    if (seen.has(object)) continue;
    seen.add(object);
    for (const key of Reflect.ownKeys(object).slice(0, 120)) {
      try {
        const child = (object as Record<PropertyKey, unknown>)[key];
        if (child && (typeof child === "object" || typeof child === "function")) queue.push({ value: child, depth: depth + 1 });
      } catch {
        // Ignore inaccessible framework internals.
      }
    }
  }
  return null;
}

function findLiveMap(): MapLike | null {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(".map-shell, .maplibregl-map, .mapboxgl-map, canvas"));
  for (const root of roots) {
    for (const key of Reflect.ownKeys(root)) {
      if (typeof key !== "string" || (!key.startsWith("__reactFiber$") && !key.startsWith("__reactProps$") && !key.startsWith("__reactContainer$"))) continue;
      try {
        const found = searchObject((root as Record<PropertyKey, unknown>)[key]);
        if (found) return found;
      } catch {
        // Continue searching other React roots.
      }
    }
  }
  return null;
}

function setSourceData(map: MapLike, id: string, data: unknown, options: Record<string, unknown> = {}) {
  const existing = map.getSource(id);
  if (existing) existing.setData(data);
  else map.addSource(id, { type: "geojson", data, ...options });
}

function ensureLayers(map: MapLike) {
  if (!map.getLayer(CASING_LAYER)) map.addLayer({ id: CASING_LAYER, type: "line", source: ROUTE_SOURCE, paint: { "line-color": "rgba(255,255,255,0.96)", "line-width": 10, "line-opacity": 0.98 }, layout: { "line-cap": "round", "line-join": "round" } });
  if (!map.getLayer(LINE_LAYER)) map.addLayer({ id: LINE_LAYER, type: "line", source: ROUTE_SOURCE, paint: { "line-color": "#1677ff", "line-width": 5.5 }, layout: { "line-cap": "round", "line-join": "round" } });
  if (!map.getLayer(MOTION_LAYER)) map.addLayer({ id: MOTION_LAYER, type: "line", source: ROUTE_SOURCE, paint: { "line-width": 7, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,255,255,0)", 0.08, "rgba(180,230,255,0.9)", 0.16, "rgba(255,255,255,0)" ] }, layout: { "line-cap": "round", "line-join": "round" } });
  if (!map.getLayer(STOP_CIRCLE_LAYER)) map.addLayer({ id: STOP_CIRCLE_LAYER, type: "circle", source: STOP_SOURCE, paint: { "circle-radius": 12, "circle-color": "#1677ff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });
  if (!map.getLayer(STOP_LABEL_LAYER)) map.addLayer({ id: STOP_LABEL_LAYER, type: "symbol", source: STOP_SOURCE, layout: { "text-field": ["get", "label"], "text-size": 12, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true }, paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,0.45)", "text-halo-width": 1 } });
}

export default function MapNativeRoadRoute() {
  useEffect(() => {
    let destroyed = false;
    let map: MapLike | null = null;
    let routeKey = "";
    let controller: AbortController | null = null;
    let animationFrame = 0;
    let animationStart = performance.now();

    const animate = () => {
      if (destroyed) return;
      if (map?.setPaintProperty && map.getLayer(MOTION_LAYER)) {
        const phase = ((performance.now() - animationStart) % 4200) / 4200;
        const a = Math.max(0, phase - 0.06);
        const b = phase;
        const c = Math.min(1, phase + 0.06);
        map.setPaintProperty(MOTION_LAYER, "line-gradient", ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,255,255,0)", a, "rgba(255,255,255,0)", b, "rgba(184,232,255,1)", c, "rgba(255,255,255,0)", 1, "rgba(255,255,255,0)"]);
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const renderRoute = async () => {
      if (destroyed) return;
      map = map || findLiveMap();
      if (!map) return;
      if (map.isStyleLoaded && !map.isStyleLoaded()) return;

      const ids = orderedIds();
      const stops = ids.map((id) => ({ id, coord: JOB_COORDS.get(id) })).filter((item): item is { id: string; coord: LngLat } => Boolean(item.coord));
      const nextKey = stops.map((stop) => stop.id).join("|");
      if (!stops.length || nextKey === routeKey) return;

      controller?.abort();
      controller = new AbortController();
      try {
        const origin = await currentLocation();
        const coordinates = await routedGeometry([origin, ...stops.map((stop) => stop.coord)], controller.signal);
        if (destroyed) return;

        setSourceData(map, ROUTE_SOURCE, { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }, { lineMetrics: true });
        setSourceData(map, STOP_SOURCE, {
          type: "FeatureCollection",
          features: stops.map((stop, index) => ({ type: "Feature", properties: { label: String(index + 1), id: stop.id }, geometry: { type: "Point", coordinates: stop.coord } })),
        });
        ensureLayers(map);
        routeKey = nextKey;
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("HPD native road route unavailable", error);
      }
    };

    const timer = window.setInterval(() => void renderRoute(), 500);
    const onClick = () => window.setTimeout(() => { routeKey = ""; void renderRoute(); }, 80);
    const onStorage = () => { routeKey = ""; void renderRoute(); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("storage", onStorage);
    void renderRoute();
    animationFrame = requestAnimationFrame(animate);

    return () => {
      destroyed = true;
      controller?.abort();
      window.clearInterval(timer);
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
