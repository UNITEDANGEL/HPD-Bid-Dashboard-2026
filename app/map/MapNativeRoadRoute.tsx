"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type LngLat = [number, number];
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[] };
type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapLike = {
  getSource: (id: string) => GeoJsonSourceLike | undefined;
  addSource: (id: string, source: unknown) => void;
  getLayer: (id: string) => unknown;
  addLayer: (layer: unknown) => void;
  setPaintProperty?: (layer: string, property: string, value: unknown) => void;
  isStyleLoaded?: () => boolean;
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

function isMapLike(value: unknown): value is MapLike {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  const candidate = value as Partial<MapLike>;
  return (
    typeof candidate.getSource === "function" &&
    typeof candidate.addSource === "function" &&
    typeof candidate.getLayer === "function" &&
    typeof candidate.addLayer === "function"
  );
}

function searchObject(root: unknown, maxDepth = 14): MapLike | null {
  const seen = new WeakSet<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];

  while (queue.length) {
    const { value, depth } = queue.shift()!;
    if (isMapLike(value)) return value;
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
        if (child && (typeof child === "object" || typeof child === "function")) {
          queue.push({ value: child, depth: depth + 1 });
        }
      } catch {
        // Ignore inaccessible properties.
      }
    }
  }

  return null;
}

function findLiveMap(): MapLike | null {
  const globalCandidate = (window as unknown as Record<string, unknown>).__HPD_MAP__;
  if (isMapLike(globalCandidate)) return globalCandidate;

  const roots = Array.from(
    document.querySelectorAll<HTMLElement>(".map-shell, .maplibregl-map, .mapboxgl-map, .leaflet-container, canvas"),
  );

  for (const root of roots) {
    if (isMapLike(root)) return root;
    for (const key of Reflect.ownKeys(root)) {
      try {
        const child = (root as unknown as Record<PropertyKey, unknown>)[key];
        const found = searchObject(child);
        if (found) return found;
      } catch {
        // Continue searching.
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
  if (!map.getLayer(CASING_LAYER)) {
    map.addLayer({
      id: CASING_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "rgba(255,255,255,0.98)", "line-width": 10 },
    });
  }
  if (!map.getLayer(LINE_LAYER)) {
    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1677ff", "line-width": 5.5 },
    });
  }
  if (!map.getLayer(MOTION_LAYER)) {
    map.addLayer({
      id: MOTION_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": 7,
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          "rgba(255,255,255,0)",
          0.08,
          "rgba(200,240,255,1)",
          0.16,
          "rgba(255,255,255,0)",
        ],
      },
    });
  }
  if (!map.getLayer(STOP_CIRCLE_LAYER)) {
    map.addLayer({
      id: STOP_CIRCLE_LAYER,
      type: "circle",
      source: STOP_SOURCE,
      paint: {
        "circle-radius": 12,
        "circle-color": "#1677ff",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
  }
  if (!map.getLayer(STOP_LABEL_LAYER)) {
    map.addLayer({
      id: STOP_LABEL_LAYER,
      type: "symbol",
      source: STOP_SOURCE,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,0.45)", "text-halo-width": 1 },
    });
  }
}

export default function MapNativeRoadRoute() {
  useEffect(() => {
    let destroyed = false;
    let map: MapLike | null = null;
    let routeKey = "";
    let controller: AbortController | null = null;
    let animationFrame = 0;
    const animationStart = performance.now();

    const animate = () => {
      if (destroyed) return;
      if (map?.setPaintProperty && map.getLayer(MOTION_LAYER)) {
        const phase = ((performance.now() - animationStart) % 4200) / 4200;
        const a = Math.max(0, phase - 0.055);
        const b = phase;
        const c = Math.min(1, phase + 0.055);
        map.setPaintProperty(MOTION_LAYER, "line-gradient", [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          "rgba(255,255,255,0)",
          a,
          "rgba(255,255,255,0)",
          b,
          "rgba(210,245,255,1)",
          c,
          "rgba(255,255,255,0)",
          1,
          "rgba(255,255,255,0)",
        ]);
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const renderRoute = async () => {
      if (destroyed) return;
      map = map || findLiveMap();
      if (!map) return;
      if (map.isStyleLoaded && !map.isStyleLoaded()) return;

      const ids = orderedIds();
      const stops = ids
        .map((id) => ({ id, coord: JOB_COORDS.get(id) }))
        .filter((item): item is { id: string; coord: LngLat } => Boolean(item.coord));
      const nextKey = stops.map((stop) => stop.id).join("|");
      if (!stops.length || (nextKey === routeKey && map.getLayer(LINE_LAYER))) return;

      controller?.abort();
      controller = new AbortController();

      try {
        const origin = await currentLocation();
        const coordinates = await routedGeometry([origin, ...stops.map((stop) => stop.coord)], controller.signal);
        if (destroyed) return;

        setSourceData(
          map,
          ROUTE_SOURCE,
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
          { lineMetrics: true },
        );
        setSourceData(map, STOP_SOURCE, {
          type: "FeatureCollection",
          features: stops.map((stop, index) => ({
            type: "Feature",
            properties: { label: String(index + 1), id: stop.id },
            geometry: { type: "Point", coordinates: stop.coord },
          })),
        });
        ensureLayers(map);
        routeKey = nextKey;
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("HPD road route unavailable", error);
      }
    };

    const timer = window.setInterval(() => void renderRoute(), 500);
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
    };
  }, []);

  return null;
}
