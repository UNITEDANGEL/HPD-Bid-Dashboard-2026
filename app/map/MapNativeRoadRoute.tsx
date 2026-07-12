"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type LngLat = [number, number];
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[] };
type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapboxLike = {
  getSource: (id: string) => GeoJsonSourceLike | undefined;
  addSource: (id: string, source: unknown) => void;
  getLayer: (id: string) => unknown;
  addLayer: (layer: unknown) => void;
  setPaintProperty?: (layer: string, property: string, value: unknown) => void;
  isStyleLoaded?: () => boolean;
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
};
type LeafletPoint = { x: number; y: number };
type LeafletLike = {
  latLngToContainerPoint: (latlng: [number, number] | { lat: number; lng: number }) => LeafletPoint;
  getContainer: () => HTMLElement;
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

function isMapboxLike(value: unknown): value is MapboxLike {
  const candidate = value as Partial<MapboxLike> | null;
  return Boolean(candidate && typeof candidate.getSource === "function" && typeof candidate.addSource === "function" && typeof candidate.getLayer === "function" && typeof candidate.addLayer === "function");
}

function isLeafletLike(value: unknown): value is LeafletLike {
  const candidate = value as Partial<LeafletLike> | null;
  return Boolean(candidate && typeof candidate.latLngToContainerPoint === "function" && typeof candidate.getContainer === "function");
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
    try { keys = Reflect.ownKeys(object); } catch { continue; }
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

function findLiveMap(): MapboxLike | LeafletLike | null {
  const globalCandidate = (window as unknown as Record<string, unknown>).__HPD_MAP__;
  if (isMapboxLike(globalCandidate) || isLeafletLike(globalCandidate)) return globalCandidate;
  const roots = Array.from(document.querySelectorAll<HTMLElement>(".map-shell, .maplibregl-map, .mapboxgl-map, .leaflet-container, canvas"));
  for (const root of roots) {
    for (const key of Reflect.ownKeys(root)) {
      try {
        const child = (root as unknown as Record<PropertyKey, unknown>)[key];
        const found = searchObject(child);
        if (found) return found;
      } catch {
        // Continue searching other roots.
      }
    }
  }
  return null;
}

function setSourceData(map: MapboxLike, id: string, data: unknown, options: Record<string, unknown> = {}) {
  const existing = map.getSource(id);
  if (existing) existing.setData(data);
  else map.addSource(id, { type: "geojson", data, ...options });
}

function ensureMapboxLayers(map: MapboxLike) {
  if (!map.getLayer(CASING_LAYER)) map.addLayer({ id: CASING_LAYER, type: "line", source: ROUTE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "rgba(255,255,255,0.98)", "line-width": 11 } });
  if (!map.getLayer(LINE_LAYER)) map.addLayer({ id: LINE_LAYER, type: "line", source: ROUTE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b78ff", "line-width": 6.5 } });
  if (!map.getLayer(MOTION_LAYER)) map.addLayer({ id: MOTION_LAYER, type: "line", source: ROUTE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 8, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,255,255,0)", 0.08, "rgba(210,245,255,1)", 0.16, "rgba(255,255,255,0)"] } });
  if (!map.getLayer(STOP_CIRCLE_LAYER)) map.addLayer({ id: STOP_CIRCLE_LAYER, type: "circle", source: STOP_SOURCE, paint: { "circle-radius": 13, "circle-color": "#0b78ff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  if (!map.getLayer(STOP_LABEL_LAYER)) map.addLayer({ id: STOP_LABEL_LAYER, type: "symbol", source: STOP_SOURCE, layout: { "text-field": ["get", "label"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,0.55)", "text-halo-width": 1 } });
}

function renderLeafletRoute(map: LeafletLike, geometry: LngLat[], stops: Array<{ id: string; coord: LngLat }>) {
  const container = map.getContainer();
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  let svg = container.querySelector<SVGSVGElement>("svg[data-hpd-native-route='true']");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.hpdNativeRoute = "true";
    Object.assign(svg.style, { position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "650", pointerEvents: "none", overflow: "hidden" });
    container.appendChild(svg);
  }
  const rect = container.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  const points = geometry.map(([lng, lat]) => map.latLngToContainerPoint([lat, lng]));
  const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const stopNodes = stops.map((stop, index) => {
    const point = map.latLngToContainerPoint([stop.coord[1], stop.coord[0]]);
    return `<g><circle cx="${point.x}" cy="${point.y}" r="13" fill="#0b78ff" stroke="#fff" stroke-width="3"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="12" font-weight="900">${index + 1}</text></g>`;
  }).join("");
  svg.innerHTML = `<path id="hpd-leaflet-road-route" d="${d}" fill="none" stroke="rgba(255,255,255,.98)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#0b78ff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><g><circle r="5" fill="#dff7ff" stroke="#0b78ff" stroke-width="2"><animateMotion dur="4.2s" repeatCount="indefinite"><mpath href="#hpd-leaflet-road-route"/></animateMotion></circle></g>${stopNodes}`;
}

export default function MapNativeRoadRoute() {
  useEffect(() => {
    let destroyed = false;
    let map: MapboxLike | LeafletLike | null = null;
    let routeKey = "";
    let controller: AbortController | null = null;
    let animationFrame = 0;
    let latestGeometry: LngLat[] = [];
    let latestStops: Array<{ id: string; coord: LngLat }> = [];
    const animationStart = performance.now();

    const redrawLeaflet = () => {
      if (map && isLeafletLike(map) && latestGeometry.length) renderLeafletRoute(map, latestGeometry, latestStops);
    };

    const animate = () => {
      if (destroyed) return;
      if (map && isMapboxLike(map) && map.setPaintProperty && map.getLayer(MOTION_LAYER)) {
        const phase = ((performance.now() - animationStart) % 4200) / 4200;
        const a = Math.max(0, phase - 0.055);
        const c = Math.min(1, phase + 0.055);
        map.setPaintProperty(MOTION_LAYER, "line-gradient", ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,255,255,0)", a, "rgba(255,255,255,0)", phase, "rgba(210,245,255,1)", c, "rgba(255,255,255,0)", 1, "rgba(255,255,255,0)"]);
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const renderRoute = async () => {
      if (destroyed) return;
      map = map || findLiveMap();
      if (!map) return;
      if (isMapboxLike(map) && map.isStyleLoaded && !map.isStyleLoaded()) return;

      const ids = orderedIds();
      const stops = ids.map((id) => ({ id, coord: JOB_COORDS.get(id) })).filter((item): item is { id: string; coord: LngLat } => Boolean(item.coord));
      const nextKey = stops.map((stop) => stop.id).join("|");
      if (!stops.length) return;
      if (nextKey === routeKey && latestGeometry.length) {
        redrawLeaflet();
        return;
      }

      controller?.abort();
      controller = new AbortController();
      try {
        const origin = await currentLocation();
        const coordinates = await routedGeometry([origin, ...stops.map((stop) => stop.coord)], controller.signal);
        if (destroyed) return;
        latestGeometry = coordinates;
        latestStops = stops;

        if (isMapboxLike(map)) {
          setSourceData(map, ROUTE_SOURCE, { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }, { lineMetrics: true });
          setSourceData(map, STOP_SOURCE, { type: "FeatureCollection", features: stops.map((stop, index) => ({ type: "Feature", properties: { label: String(index + 1), id: stop.id }, geometry: { type: "Point", coordinates: stop.coord } })) });
          ensureMapboxLayers(map);
        } else {
          renderLeafletRoute(map, coordinates, stops);
          map.on?.("move zoom resize", redrawLeaflet);
        }
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
    window.addEventListener("resize", redrawLeaflet);
    void renderRoute();
    animationFrame = requestAnimationFrame(animate);

    return () => {
      destroyed = true;
      controller?.abort();
      window.clearInterval(timer);
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("click", forceRefresh, true);
      window.removeEventListener("storage", forceRefresh);
      window.removeEventListener("resize", redrawLeaflet);
      if (map && isLeafletLike(map)) map.off?.("move zoom resize", redrawLeaflet);
      document.querySelectorAll("svg[data-hpd-native-route='true']").forEach((element) => element.remove());
    };
  }, []);

  return null;
}
