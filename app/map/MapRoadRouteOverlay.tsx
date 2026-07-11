"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type LngLat = [number, number];
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[] };
type Calibration = { mx: number; my: number; sx: number; sy: number };
type Transform = { ax: number; bx: number; cx: number; ay: number; by: number; cy: number };

type OsrmResponse = {
  code?: string;
  routes?: Array<{ geometry?: { type?: string; coordinates?: LngLat[] } }>;
};

const STORAGE_KEY = "hpd-unified-workflow-v1";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;
const BASE_COORDS: LngLat = [-73.8331, 40.6957];
const ROUTER = "https://router.project-osrm.org/route/v1/driving";

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const lat = numberValue(record.Latitude ?? record.latitude ?? record.lat);
  const lng = numberValue(record.Longitude ?? record.longitude ?? record.lng ?? record.lon);
  if (id && lat && lng) JOB_COORDS.set(id, [lng, lat]);
}

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readSaved(): SavedWorkflow {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedWorkflow) : {};
  } catch {
    return {};
  }
}

function orderedRouteIds() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
  const fromRows = rows
    .map((row) => textOf(row).match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "")
    .filter(Boolean);
  if (fromRows.length) return Array.from(new Set(fromRows)).slice(0, 6);

  const saved = readSaved();
  const ids = saved.routeIds?.length ? saved.routeIds : saved.resultIds || [];
  return Array.from(new Set(ids.map((id) => id.toUpperCase()))).slice(0, 6);
}

function mapElement() {
  return (
    document.querySelector<HTMLElement>(".map-shell .maplibregl-map") ||
    document.querySelector<HTMLElement>(".map-shell .mapboxgl-map") ||
    document.querySelector<HTMLElement>(".map-shell [class*='map-stage']")
  );
}

function markerElements() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      ".maturity-map-marker, [data-omo], [data-job-id], .maplibregl-marker, .mapboxgl-marker",
    ),
  ).filter((element) => !element.closest(".hpd-road-route-overlay"));
}

function markerId(marker: HTMLElement) {
  const combined = [
    marker.dataset.omo,
    marker.dataset.jobId,
    marker.dataset.id,
    marker.getAttribute("aria-label"),
    marker.getAttribute("title"),
    textOf(marker),
  ]
    .filter(Boolean)
    .join(" ");
  return combined.match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "";
}

function markerCenter(marker: HTMLElement, mapRect: DOMRect) {
  const rect = marker.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { sx: rect.left - mapRect.left + rect.width / 2, sy: rect.top - mapRect.top + rect.height / 2 };
}

function mercator([lng, lat]: LngLat) {
  const x = (lng + 180) / 360;
  const sin = Math.sin((Math.max(-85.051129, Math.min(85.051129, lat)) * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { x, y };
}

function solve3(matrix: number[][], vector: number[]) {
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (Math.abs(a[pivot][column]) < 1e-14) return null;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let k = column; k < 4; k += 1) a[column][k] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let k = column; k < 4; k += 1) a[row][k] -= factor * a[column][k];
    }
  }
  return [a[0][3], a[1][3], a[2][3]];
}

function fitAffine(samples: Calibration[]): Transform | null {
  if (samples.length < 3) return null;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sx = 0;
  let sy = 0;
  let n = 0;
  let txX = 0;
  let tyX = 0;
  let tX = 0;
  let txY = 0;
  let tyY = 0;
  let tY = 0;

  for (const sample of samples) {
    sxx += sample.mx * sample.mx;
    syy += sample.my * sample.my;
    sxy += sample.mx * sample.my;
    sx += sample.mx;
    sy += sample.my;
    n += 1;
    txX += sample.mx * sample.sx;
    tyX += sample.my * sample.sx;
    tX += sample.sx;
    txY += sample.mx * sample.sy;
    tyY += sample.my * sample.sy;
    tY += sample.sy;
  }

  const normal = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const x = solve3(normal, [txX, tyX, tX]);
  const y = solve3(normal, [txY, tyY, tY]);
  if (!x || !y) return null;
  return { ax: x[0], bx: x[1], cx: x[2], ay: y[0], by: y[1], cy: y[2] };
}

function project(coord: LngLat, transform: Transform) {
  const point = mercator(coord);
  return {
    x: transform.ax * point.x + transform.bx * point.y + transform.cx,
    y: transform.ay * point.x + transform.by * point.y + transform.cy,
  };
}

function collectCalibration(mapRect: DOMRect) {
  const samples: Calibration[] = [];
  for (const marker of markerElements()) {
    const id = markerId(marker);
    const coord = JOB_COORDS.get(id);
    const center = markerCenter(marker, mapRect);
    if (!coord || !center) continue;
    const m = mercator(coord);
    samples.push({ mx: m.x, my: m.y, sx: center.sx, sy: center.sy });
  }
  return samples;
}

function currentLocation(): Promise<LngLat> {
  if (!navigator.geolocation) return Promise.resolve(BASE_COORDS);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => resolve(BASE_COORDS),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 6_000 },
    );
  });
}

async function fetchRoadGeometry(coords: LngLat[], signal: AbortSignal) {
  const path = coords.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const url = `${ROUTER}/${path}?overview=full&geometries=geojson&steps=false&continue_straight=false`;
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
  const data = (await response.json()) as OsrmResponse;
  const geometry = data.routes?.[0]?.geometry?.coordinates;
  if (data.code !== "Ok" || !geometry?.length) throw new Error("No routed geometry returned");
  return geometry;
}

function pathData(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export default function MapRoadRouteOverlay() {
  useEffect(() => {
    let destroyed = false;
    let overlay: SVGSVGElement | null = null;
    let currentMap: HTMLElement | null = null;
    let frame = 0;
    let routeKey = "";
    let routeGeometry: LngLat[] = [];
    let routeStops: Array<{ id: string; coord: LngLat }> = [];
    let controller: AbortController | null = null;
    let origin: LngLat = BASE_COORDS;

    const ensureOverlay = (map: HTMLElement) => {
      if (window.getComputedStyle(map).position === "static") map.style.position = "relative";
      if (!overlay || overlay.parentElement !== map) {
        overlay?.remove();
        overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.classList.add("hpd-road-route-overlay");
        overlay.setAttribute("aria-hidden", "true");
        map.appendChild(overlay);
      }
      return overlay;
    };

    const draw = () => {
      const map = mapElement();
      if (!map || !routeGeometry.length || !routeStops.length) return;
      currentMap = map;
      const svg = ensureOverlay(map);
      const rect = map.getBoundingClientRect();
      const transform = fitAffine(collectCalibration(rect));
      if (!transform) {
        svg.classList.remove("is-visible");
        return;
      }

      svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
      svg.setAttribute("width", String(rect.width));
      svg.setAttribute("height", String(rect.height));
      const projected = routeGeometry.map((coord) => project(coord, transform));
      const d = pathData(projected);
      const stopNodes = routeStops
        .map((stop, index) => {
          const point = project(stop.coord, transform);
          return `<g class="hpd-road-route-stop"><circle cx="${point.x}" cy="${point.y}" r="12"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle">${index + 1}</text></g>`;
        })
        .join("");

      svg.innerHTML = `
        <path class="hpd-road-route-casing" d="${d}" />
        <path class="hpd-road-route-line" d="${d}" />
        ${stopNodes}
      `;
      svg.classList.add("is-visible");
    };

    const refreshRoute = async () => {
      const ids = orderedRouteIds();
      const stops = ids
        .map((id) => ({ id, coord: JOB_COORDS.get(id) }))
        .filter((item): item is { id: string; coord: LngLat } => Boolean(item.coord));
      if (!stops.length) {
        routeGeometry = [];
        routeStops = [];
        overlay?.classList.remove("is-visible");
        return;
      }

      const nextKey = stops.map((stop) => stop.id).join("|");
      if (nextKey === routeKey && routeGeometry.length) {
        draw();
        return;
      }

      routeKey = nextKey;
      routeStops = stops;
      controller?.abort();
      controller = new AbortController();
      try {
        origin = await currentLocation();
        routeGeometry = await fetchRoadGeometry([origin, ...stops.map((stop) => stop.coord)], controller.signal);
        if (!destroyed) draw();
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          routeGeometry = [];
          overlay?.classList.remove("is-visible");
          console.warn("HPD road route unavailable", error);
        }
      }
    };

    const schedule = () => {
      if (frame || destroyed) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        void refreshRoute();
      });
    };

    void refreshRoute();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const interval = window.setInterval(schedule, 500);
    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("storage", schedule);

    return () => {
      destroyed = true;
      controller?.abort();
      observer.disconnect();
      window.clearInterval(interval);
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("storage", schedule);
      overlay?.remove();
      if (currentMap && window.getComputedStyle(currentMap).position === "relative") {
        // Leave map positioning intact; MapLibre commonly uses relative positioning.
      }
    };
  }, []);

  return null;
}
