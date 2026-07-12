"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type LngLat = [number, number];
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[]; routeIndex?: number };
type StopPoint = { x: number; y: number; id: string; coord?: LngLat };
type ScreenPoint = { x: number; y: number };
type MapboxProjector = { getContainer: () => HTMLElement; project: (coord: LngLat | { lng: number; lat: number }) => ScreenPoint };
type LeafletProjector = { getContainer: () => HTMLElement; latLngToContainerPoint: (coord: [number, number] | { lat: number; lng: number }) => ScreenPoint };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readSaved(): SavedWorkflow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedWorkflow) : {};
  } catch {
    return {};
  }
}

function writeRouteIndex(index: number) {
  const saved = readSaved();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, routeIndex: index }));
  window.dispatchEvent(new CustomEvent("hpd-route-index-change", { detail: { index } }));
}

function value(record: JobRecord, keys: string[]) {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" || typeof raw === "number") {
      const text = String(raw).trim();
      if (text) return text;
    }
  }
  return "";
}

const JOB_COORDS = new Map<string, LngLat>();
for (const record of bundledJobsData as JobRecord[]) {
  const id = value(record, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  const lat = Number(record.Latitude ?? record.latitude ?? record.lat);
  const lng = Number(record.Longitude ?? record.longitude ?? record.lng ?? record.lon);
  if (id && Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) JOB_COORDS.set(id, [lng, lat]);
}

function orderedIds() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row")).filter(
    (row) => row.getClientRects().length > 0,
  );
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
    document.querySelector<HTMLElement>(".map-shell .leaflet-container") ||
    document.querySelector<HTMLElement>(".map-shell [class*='map-stage']")
  );
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

function markerCandidates() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], .maplibregl-marker, .mapboxgl-marker, .leaflet-marker-icon",
    ),
  ).filter((marker) => marker.getClientRects().length > 0 && !marker.closest(".hpd-sequential-guide"));
}

function markerFor(id: string, mapRect: DOMRect) {
  const upper = id.toUpperCase();
  return (
    markerCandidates().find((marker) => {
      if (!markerIdentity(marker).includes(upper)) return false;
      const rect = marker.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return cx >= mapRect.left && cx <= mapRect.right && cy >= mapRect.top && cy <= mapRect.bottom;
    }) || null
  );
}

function centerOf(element: HTMLElement, mapRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { x: rect.left - mapRect.left + rect.width / 2, y: rect.top - mapRect.top + rect.height / 2 };
}

function markerCoordinate(marker: HTMLElement | null, id: string): LngLat | undefined {
  if (marker) {
    const source = marker.closest<HTMLElement>("[data-lat][data-lng]") || marker;
    const lat = Number(source.dataset.lat ?? source.dataset.latitude);
    const lng = Number(source.dataset.lng ?? source.dataset.longitude ?? source.dataset.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) return [lng, lat];
  }
  return JOB_COORDS.get(id);
}

function mapLocationPoint(mapRect: DOMRect) {
  const selectors = [
    ".maplibregl-user-location-dot",
    ".maplibregl-user-location-dot-stale",
    ".mapboxgl-user-location-dot",
    ".mapboxgl-user-location-dot-stale",
    ".map-current-location-marker",
    ".map-user-location-marker",
    "[data-current-location='true']",
    "[aria-label*='current location' i]",
    ".leaflet-marker-icon[title*='current location' i]",
    ".leaflet-marker-icon[aria-label*='current location' i]",
  ];
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const marker of candidates) {
      if (!marker.getClientRects().length) continue;
      const point = centerOf(marker, mapRect);
      if (!point) continue;
      if (point.x < 0 || point.y < 0 || point.x > mapRect.width || point.y > mapRect.height) continue;
      return point;
    }
  }
  return null;
}

function isMapboxProjector(value: unknown): value is MapboxProjector {
  const candidate = value as Partial<MapboxProjector> | null;
  return Boolean(candidate && typeof candidate.getContainer === "function" && typeof candidate.project === "function");
}

function isLeafletProjector(value: unknown): value is LeafletProjector {
  const candidate = value as Partial<LeafletProjector> | null;
  return Boolean(candidate && typeof candidate.getContainer === "function" && typeof candidate.latLngToContainerPoint === "function");
}

function searchObject(root: unknown, maxDepth = 12): MapboxProjector | LeafletProjector | null {
  const seen = new WeakSet<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  while (queue.length) {
    const { value, depth } = queue.shift()!;
    if (isMapboxProjector(value) || isLeafletProjector(value)) return value;
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
    for (const key of keys.slice(0, 300)) {
      try {
        const child = (object as unknown as Record<PropertyKey, unknown>)[key];
        if (child && (typeof child === "object" || typeof child === "function")) {
          queue.push({ value: child, depth: depth + 1 });
        }
      } catch {
        // Ignore inaccessible framework internals.
      }
    }
  }
  return null;
}

function findProjector(map: HTMLElement): MapboxProjector | LeafletProjector | null {
  const globalCandidate = (window as unknown as Record<string, unknown>).__HPD_MAP__;
  if (isMapboxProjector(globalCandidate) || isLeafletProjector(globalCandidate)) return globalCandidate;
  const roots = [map, ...Array.from(map.querySelectorAll<HTMLElement>("canvas, .maplibregl-canvas, .mapboxgl-canvas, .leaflet-map-pane"))];
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

function projectGps(map: HTMLElement, gps: LngLat | null): ScreenPoint | null {
  if (!gps) return null;
  const projector = findProjector(map);
  if (!projector) return null;
  try {
    const point = isMapboxProjector(projector)
      ? projector.project(gps)
      : projector.latLngToContainerPoint([gps[1], gps[0]]);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y };
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export default function MapSequentialGuide() {
  useEffect(() => {
    let destroyed = false;
    let frame = 0;
    let svg: SVGSVGElement | null = null;
    let dock: HTMLDivElement | null = null;
    let liveGps: LngLat | null = null;
    let gpsAccuracy: number | null = null;

    const render = () => {
      if (destroyed) return;
      const map = mapElement();
      if (!map) return;
      if (getComputedStyle(map).position === "static") map.style.position = "relative";

      if (!svg || svg.parentElement !== map) {
        svg?.remove();
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("hpd-sequential-guide");
        Object.assign(svg.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          zIndex: "650",
          overflow: "hidden",
          pointerEvents: "none",
          opacity: "0",
        });
        svg.addEventListener("click", (event) => {
          const node = (event.target as Element | null)?.closest<SVGGElement>("g[data-visible-index]");
          if (!node) return;
          event.preventDefault();
          event.stopPropagation();
          writeRouteIndex(Number(node.dataset.visibleIndex || 0));
          if (svg) svg.dataset.signature = "";
          render();
        });
        map.appendChild(svg);
      }

      if (!dock || dock.parentElement !== map) {
        dock?.remove();
        dock = document.createElement("div");
        Object.assign(dock.style, {
          position: "absolute",
          left: "50%",
          bottom: "18px",
          transform: "translateX(-50%)",
          zIndex: "900",
          width: "min(320px, calc(100% - 28px))",
          padding: "10px",
          borderRadius: "15px",
          background: "rgba(8,24,44,.94)",
          boxShadow: "0 12px 30px rgba(15,23,42,.28)",
          color: "#fff",
        });
        map.appendChild(dock);
      }

      const rect = map.getBoundingClientRect();
      const visibleStops: StopPoint[] = [];
      for (const id of orderedIds()) {
        const marker = markerFor(id, rect);
        if (!marker) continue;
        const center = centerOf(marker, rect);
        if (!center) continue;
        visibleStops.push({ ...center, id, coord: markerCoordinate(marker, id) });
      }

      if (!visibleStops.length) {
        svg.innerHTML = "";
        svg.style.opacity = "0";
        dock.hidden = true;
        return;
      }

      const mapPoint = mapLocationPoint(rect);
      const gpsPoint = !mapPoint && gpsAccuracy !== null && gpsAccuracy <= 50 ? projectGps(map, liveGps) : null;
      const youPoint = mapPoint || gpsPoint;
      const sourceLabel = mapPoint ? "map location marker" : gpsPoint ? `live GPS · ±${Math.round(gpsAccuracy || 0)} m` : "location unavailable";
      const saved = readSaved();
      const requestedIndex = Number.isFinite(saved.routeIndex) ? Number(saved.routeIndex) : 0;
      const activeIndex = Math.max(0, Math.min(visibleStops.length - 1, requestedIndex));
      const points = youPoint ? [{ ...youPoint, id: "you" }, ...visibleStops] : visibleStops;
      const signature = `${points.map((point) => `${point.id}:${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|")}|active:${activeIndex}|source:${sourceLabel}`;
      if (svg.dataset.signature === signature) return;
      svg.dataset.signature = signature;

      svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
      const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
      const stopOffset = youPoint ? 1 : 0;
      const nodes = points
        .map((point, index) => {
          if (youPoint && index === 0) {
            return `<g><circle cx="${point.x}" cy="${point.y}" r="16" fill="#0ea56b" stroke="#fff" stroke-width="3"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="900">YOU</text></g>`;
          }
          const visibleIndex = index - stopOffset;
          const active = visibleIndex === activeIndex;
          return `<g data-visible-index="${visibleIndex}" role="button" style="pointer-events:all;cursor:pointer"><circle cx="${point.x}" cy="${point.y}" r="${active ? 18 : 15}" fill="${active ? "#ff8a00" : "#1677ff"}" stroke="#fff" stroke-width="3"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="12" font-weight="900" style="pointer-events:none">${visibleIndex + 1}</text></g>`;
        })
        .join("");

      svg.innerHTML = `<path id="hpd-sequential-guide-path" d="${d}" fill="none" stroke="rgba(255,255,255,.98)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#1677ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><g aria-hidden="true"><circle r="5" fill="#e8fbff" stroke="#1677ff" stroke-width="2"><animateMotion dur="5s" repeatCount="indefinite"><mpath href="#hpd-sequential-guide-path"/></animateMotion></circle></g>${nodes}`;
      svg.style.opacity = "1";

      const active = visibleStops[activeIndex];
      const coord = active.coord;
      const google = coord
        ? `https://www.google.com/maps/dir/?api=1&destination=${coord[1]},${coord[0]}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(active.id)}`;
      const waze = coord
        ? `https://waze.com/ul?ll=${coord[1]},${coord[0]}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(active.id)}&navigate=yes`;
      const locationStatus = youPoint ? `YOU uses ${sourceLabel}` : "Turn on the map location button to add YOU → 1";
      dock.innerHTML = `<div style="font-size:12px;font-weight:900">STOP ${activeIndex + 1} · ${escapeHtml(active.id)}</div><div style="font-size:11px;opacity:.78;margin-top:3px">${escapeHtml(locationStatus)}</div><div style="display:flex;gap:8px;margin-top:7px"><a href="${google}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;text-decoration:none;background:#fff;color:#0f172a;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:900">Google</a><a href="${waze}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;text-decoration:none;background:#1677ff;color:#fff;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:900">Waze</a></div>`;
      dock.hidden = false;
    };

    const schedule = () => {
      if (frame || destroyed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    };

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          liveGps = [position.coords.longitude, position.coords.latitude];
          gpsAccuracy = position.coords.accuracy;
          if (svg) svg.dataset.signature = "";
          schedule();
        },
        () => {
          liveGps = null;
          gpsAccuracy = null;
          if (svg) svg.dataset.signature = "";
          schedule();
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
      );
    }

    render();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const timer = window.setInterval(schedule, 250);
    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("storage", schedule);
    window.addEventListener("hpd-route-index-change", schedule);

    return () => {
      destroyed = true;
      observer.disconnect();
      clearInterval(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("storage", schedule);
      window.removeEventListener("hpd-route-index-change", schedule);
      svg?.remove();
      dock?.remove();
    };
  }, []);

  return null;
}
