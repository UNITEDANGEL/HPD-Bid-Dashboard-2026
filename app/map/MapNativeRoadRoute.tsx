"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type LngLat = [number, number];
type SavedWorkflow = { routeIds?: string[]; resultIds?: string[]; routeIndex?: number };
type Point = { x: number; y: number; id: string; label: string; coord?: LngLat };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;

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

function readSaved(): SavedWorkflow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedWorkflow) : {};
  } catch {
    return {};
  }
}

function orderedIds() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"))
    .filter((row) => row.getClientRects().length > 0);
  const ids = rows
    .map((row) => textOf(row).match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "")
    .filter(Boolean);
  if (ids.length) return Array.from(new Set(ids)).slice(0, 6);

  const saved = readSaved();
  const fallback = saved.routeIds?.length ? saved.routeIds : saved.resultIds || [];
  return Array.from(new Set(fallback.map((id) => id.toUpperCase()))).slice(0, 6);
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
  ).filter((marker) => marker.getClientRects().length > 0 && !marker.closest(".hpd-marker-guide"));
}

function markerFor(id: string, mapRect: DOMRect) {
  const upper = id.toUpperCase();
  const matches = markerCandidates().filter((marker) => markerIdentity(marker).includes(upper));
  return matches.find((marker) => {
    const rect = marker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return cx >= mapRect.left && cx <= mapRect.right && cy >= mapRect.top && cy <= mapRect.bottom;
  }) || null;
}

function centerOf(element: HTMLElement, mapRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    x: rect.left - mapRect.left + rect.width / 2,
    y: rect.top - mapRect.top + rect.height / 2,
  };
}

function currentLocationPoint(mapRect: DOMRect) {
  const selectors = [
    ".maplibregl-user-location-dot",
    ".mapboxgl-user-location-dot",
    ".leaflet-marker-icon[title*='location' i]",
    ".map-current-location-marker",
    ".map-user-location-marker",
    "[data-current-location='true']",
    "[aria-label*='current location' i]",
  ];
  for (const selector of selectors) {
    const marker = document.querySelector<HTMLElement>(selector);
    if (!marker || !marker.getClientRects().length) continue;
    const point = centerOf(marker, mapRect);
    if (point) return point;
  }
  return { x: Math.max(34, mapRect.width * 0.12), y: Math.max(54, mapRect.height * 0.82) };
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function renderGuide(map: HTMLElement, svg: SVGSVGElement, dock: HTMLDivElement) {
  const rect = map.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return;

  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  svg.setAttribute("width", String(rect.width));
  svg.setAttribute("height", String(rect.height));

  const ids = orderedIds();
  const start = currentLocationPoint(rect);
  const points: Point[] = [{ ...start, id: "you", label: "YOU" }];

  ids.forEach((id, index) => {
    const marker = markerFor(id, rect);
    if (!marker) return;
    const center = centerOf(marker, rect);
    if (!center) return;
    points.push({ ...center, id, label: String(index + 1), coord: markerCoordinate(marker, id) });
  });

  if (points.length < 2) {
    svg.innerHTML = "";
    svg.style.opacity = "0";
    dock.hidden = true;
    return;
  }

  const signature = points.map((point) => `${point.id}:${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|");
  if (svg.dataset.signature === signature) return;
  svg.dataset.signature = signature;

  const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const nodes = points.map((point, index) => {
    const startNode = index === 0;
    const radius = startNode ? 16 : 15;
    const fill = startNode ? "#0ea56b" : "#1677ff";
    const fontSize = startNode ? 8 : 12;
    return `<g><circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${fill}" stroke="#fff" stroke-width="3"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Inter,Arial,sans-serif" font-size="${fontSize}" font-weight="900">${point.label}</text></g>`;
  }).join("");

  svg.innerHTML = `
    <path id="hpd-marker-guide-path" d="${d}" fill="none" stroke="rgba(255,255,255,.98)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    <path d="${d}" fill="none" stroke="#1677ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
    <g aria-hidden="true">
      <circle r="5" fill="#e8fbff" stroke="#1677ff" stroke-width="2"><animateMotion dur="5s" repeatCount="indefinite"><mpath href="#hpd-marker-guide-path" /></animateMotion></circle>
      <circle r="3.5" fill="#e8fbff" stroke="#1677ff" stroke-width="1.5"><animateMotion begin="1.65s" dur="5s" repeatCount="indefinite"><mpath href="#hpd-marker-guide-path" /></animateMotion></circle>
      <circle r="3.5" fill="#e8fbff" stroke="#1677ff" stroke-width="1.5"><animateMotion begin="3.3s" dur="5s" repeatCount="indefinite"><mpath href="#hpd-marker-guide-path" /></animateMotion></circle>
    </g>
    ${nodes}
  `;
  svg.style.opacity = "1";

  const saved = readSaved();
  const requestedIndex = Number.isFinite(saved.routeIndex) ? Number(saved.routeIndex) : 0;
  const activeIndex = Math.max(0, Math.min(points.length - 2, requestedIndex));
  const active = points[activeIndex + 1];
  const coord = active.coord;
  const title = `STOP ${active.label} · ${active.id}`;
  const google = coord
    ? `https://www.google.com/maps/dir/?api=1&destination=${coord[1]},${coord[0]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(active.id)}`;
  const waze = coord
    ? `https://waze.com/ul?ll=${coord[1]},${coord[0]}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(active.id)}&navigate=yes`;

  dock.innerHTML = `
    <div style="font-size:12px;font-weight:900;letter-spacing:.02em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(title)}</div>
    <div style="display:flex;gap:8px;margin-top:7px">
      <a href="${google}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;text-decoration:none;background:#fff;color:#0f172a;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:900">Google</a>
      <a href="${waze}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;text-decoration:none;background:#1677ff;color:#fff;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:900">Waze</a>
    </div>
  `;
  dock.hidden = false;
}

export default function MapNativeRoadRoute() {
  useEffect(() => {
    let destroyed = false;
    let frame = 0;
    let svg: SVGSVGElement | null = null;
    let dock: HTMLDivElement | null = null;

    const ensure = (map: HTMLElement) => {
      if (window.getComputedStyle(map).position === "static") map.style.position = "relative";
      if (!svg || svg.parentElement !== map) {
        svg?.remove();
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("hpd-marker-guide");
        svg.setAttribute("aria-hidden", "true");
        Object.assign(svg.style, {
          position: "absolute",
          inset: "0",
          zIndex: "640",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "hidden",
          opacity: "0",
          transition: "opacity 160ms ease",
        });
        map.appendChild(svg);
      }
      if (!dock || dock.parentElement !== map) {
        dock?.remove();
        dock = document.createElement("div");
        dock.className = "hpd-marker-guide-dock";
        Object.assign(dock.style, {
          position: "absolute",
          left: "50%",
          bottom: "18px",
          transform: "translateX(-50%)",
          zIndex: "900",
          width: "min(280px, calc(100% - 28px))",
          padding: "10px",
          borderRadius: "15px",
          background: "rgba(8,24,44,.94)",
          boxShadow: "0 12px 30px rgba(15,23,42,.28)",
          backdropFilter: "blur(14px)",
        });
        dock.hidden = true;
        map.appendChild(dock);
      }
    };

    const render = () => {
      if (destroyed) return;
      const map = mapElement();
      if (!map) return;
      ensure(map);
      if (svg && dock) renderGuide(map, svg, dock);
    };

    const schedule = () => {
      if (frame || destroyed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    };

    render();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const timer = window.setInterval(schedule, 250);
    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("storage", schedule);

    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("storage", schedule);
      svg?.remove();
      dock?.remove();
    };
  }, []);

  return null;
}
