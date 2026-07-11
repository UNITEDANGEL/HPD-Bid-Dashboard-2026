"use client";

import { useEffect } from "react";

type SavedWorkflow = {
  resultIds?: string[];
  routeIds?: string[];
  activeJobId?: string;
};

type RoutePoint = {
  x: number;
  y: number;
  id: string;
  label: string;
  current: boolean;
  offscreen: boolean;
};

const STORAGE_KEY = "hpd-unified-workflow-v1";
const EDGE_PADDING = 20;
const MAP_SELECTORS = [
  ".map-shell .maplibregl-map",
  ".map-shell .mapboxgl-map",
  ".map-shell [class*='map-canvas']",
  ".map-shell [class*='map-stage']",
];
const CURRENT_LOCATION_SELECTORS = [
  ".mapboxgl-user-location-dot",
  ".maplibregl-user-location-dot",
  ".map-current-location-marker",
  ".map-user-location-marker",
  ".current-location-marker",
  "[data-current-location='true']",
  "[aria-label*='current location' i]",
  "[title*='current location' i]",
];

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readWorkflow(): SavedWorkflow {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedWorkflow) : {};
  } catch {
    return {};
  }
}

function routeIds(workflow: SavedWorkflow) {
  if (workflow.routeIds?.length) return workflow.routeIds.slice(0, 6);
  if (workflow.resultIds?.length) return workflow.resultIds.slice(0, 6);
  return workflow.activeJobId ? [workflow.activeJobId] : [];
}

function findMapSurface() {
  for (const selector of MAP_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 200 && rect.height > 200) return element;
  }
  return null;
}

function markerIdentity(marker: HTMLElement) {
  return [
    marker.dataset.omo,
    marker.dataset.jobId,
    marker.dataset.id,
    marker.getAttribute("aria-label"),
    marker.getAttribute("title"),
    textOf(marker),
  ].filter(Boolean).join(" ").toUpperCase();
}

function allMarkerCandidates() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], [class*='map-marker']",
  ));
}

function findJobMarker(id: string) {
  const normalized = id.toUpperCase();
  return allMarkerCandidates().find((marker) => markerIdentity(marker).includes(normalized)) || null;
}

function findCurrentLocationMarker() {
  for (const selector of CURRENT_LOCATION_SELECTORS) {
    const marker = document.querySelector<HTMLElement>(selector);
    if (marker) return marker;
  }
  return null;
}

function anchorFor(element: HTMLElement, current: boolean) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  if (current) return { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 };

  const visual = element.querySelector<HTMLElement>(
    "[data-marker-anchor], .marker-pin, .map-pin, [class*='marker-pin'], [class*='pin-head']",
  );
  if (visual) {
    const visualRect = visual.getBoundingClientRect();
    if (visualRect.width || visualRect.height) {
      return { left: visualRect.left + visualRect.width / 2, top: visualRect.top + visualRect.height / 2 };
    }
  }
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointFor(element: HTMLElement, surfaceRect: DOMRect, id: string, label: string, current = false): RoutePoint | null {
  const anchor = anchorFor(element, current);
  if (!anchor) return null;

  const rawX = anchor.left - surfaceRect.left;
  const rawY = anchor.top - surfaceRect.top;
  const x = clamp(rawX, EDGE_PADDING, Math.max(EDGE_PADDING, surfaceRect.width - EDGE_PADDING));
  const y = clamp(rawY, EDGE_PADDING, Math.max(EDGE_PADDING, surfaceRect.height - EDGE_PADDING));
  const offscreen = rawX !== x || rawY !== y;

  return { x, y, id, label, current, offscreen };
}

function buildPath(points: RoutePoint[]) {
  if (points.length < 2) return "";
  const parts = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    parts.push(`C ${midX.toFixed(1)} ${previous.y.toFixed(1)}, ${midX.toFixed(1)} ${current.y.toFixed(1)}, ${current.x.toFixed(1)} ${current.y.toFixed(1)}`);
  }
  return parts.join(" ");
}

function render(surface: HTMLElement, overlay: SVGSVGElement) {
  const workflow = readWorkflow();
  const ids = routeIds(workflow);
  const surfaceRect = surface.getBoundingClientRect();

  overlay.setAttribute("viewBox", `0 0 ${Math.max(1, surfaceRect.width)} ${Math.max(1, surfaceRect.height)}`);
  overlay.setAttribute("width", String(surfaceRect.width));
  overlay.setAttribute("height", String(surfaceRect.height));
  overlay.setAttribute("preserveAspectRatio", "none");

  const points: RoutePoint[] = [];
  const currentMarker = findCurrentLocationMarker();
  if (currentMarker) {
    const point = pointFor(currentMarker, surfaceRect, "current", "You", true);
    if (point) points.push(point);
  }

  // Preserve the exact sequence. Stop labels always remain 1, 2, 3... even when a stop
  // sits just outside the visible map; off-screen stops are clamped to the map edge.
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const marker = findJobMarker(id);
    if (!marker) break;
    const point = pointFor(marker, surfaceRect, id, String(index + 1));
    if (!point) break;
    points.push(point);
  }

  const signature = points
    .map((point) => `${point.id}:${point.label}:${point.x.toFixed(1)},${point.y.toFixed(1)}:${point.offscreen ? "edge" : "map"}`)
    .join("|");
  if (overlay.dataset.signature === signature) return;
  overlay.dataset.signature = signature;

  const hasStopOne = points.some((point) => point.label === "1");
  if (points.length < 2 || !hasStopOne) {
    overlay.innerHTML = "";
    overlay.classList.remove("is-visible");
    return;
  }

  const path = buildPath(points);
  const dots = points.map((point) => `
    <g class="hpd-suggested-route-stop ${point.current ? "current" : "job"} ${point.offscreen ? "offscreen" : ""}">
      <circle cx="${point.x}" cy="${point.y}" r="${point.current ? 10 : 13}" />
      <text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle">${point.current ? "●" : point.label}</text>
    </g>`).join("");

  overlay.innerHTML = `
    <defs>
      <filter id="hpd-route-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <marker id="hpd-route-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L8,3 z" />
      </marker>
    </defs>
    <path class="hpd-suggested-route-shadow" d="${path}" />
    <path class="hpd-suggested-route-line" d="${path}" marker-end="url(#hpd-route-arrow)" />
    ${dots}
  `;
  overlay.classList.add("is-visible");
}

export default function MapRouteSequenceOverlay() {
  useEffect(() => {
    let surface: HTMLElement | null = null;
    let overlay: SVGSVGElement | null = null;
    let frame = 0;
    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;

    const ensure = () => {
      if (destroyed) return;
      const nextSurface = findMapSurface();
      if (!nextSurface) return;
      if (surface !== nextSurface) {
        resizeObserver?.disconnect();
        surface = nextSurface;
        resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(surface);
      }
      if (window.getComputedStyle(surface).position === "static") surface.style.position = "relative";
      if (!overlay || overlay.parentElement !== surface) {
        overlay?.remove();
        overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.classList.add("hpd-suggested-route-overlay");
        overlay.setAttribute("aria-hidden", "true");
        surface.appendChild(overlay);
      }
      render(surface, overlay);
    };

    const schedule = () => {
      if (frame || destroyed) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        ensure();
      });
    };

    ensure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "transform"] });
    const timer = window.setInterval(schedule, 100);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("storage", schedule);

    return () => {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver?.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("storage", schedule);
      overlay?.remove();
    };
  }, []);

  return null;
}
