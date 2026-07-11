"use client";

import { useEffect } from "react";

type SavedWorkflow = {
  stage?: string;
  resultIds?: string[];
  selectedIndex?: number;
  routeIds?: string[];
  routeIndex?: number;
  activeJobId?: string;
};

type Point = { x: number; y: number; id: string; label: string };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const MAP_SELECTORS = [
  ".map-shell .maplibregl-map",
  ".map-shell .mapboxgl-map",
  ".map-shell [class*='map-canvas']",
  ".map-shell [class*='map-stage']",
  ".map-shell",
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

function mapSurface() {
  for (const selector of MAP_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.getBoundingClientRect().width > 200 && element.getBoundingClientRect().height > 200) return element;
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

function markerFor(id: string) {
  const normalized = id.toUpperCase();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], [class*='map-marker']",
  ));
  return candidates.find((marker) => markerIdentity(marker).includes(normalized)) || null;
}

function currentLocationMarker() {
  for (const selector of CURRENT_LOCATION_SELECTORS) {
    const marker = document.querySelector<HTMLElement>(selector);
    if (marker && marker.getClientRects().length > 0) return marker;
  }
  return null;
}

function pointFor(element: HTMLElement, surfaceRect: DOMRect, id: string, label: string): Point | null {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  const x = rect.left - surfaceRect.left + rect.width / 2;
  const y = rect.top - surfaceRect.top + rect.height / 2;
  if (x < -40 || y < -40 || x > surfaceRect.width + 40 || y > surfaceRect.height + 40) return null;
  return { x, y, id, label };
}

function orderedIds(workflow: SavedWorkflow) {
  const route = workflow.routeIds || [];
  if (route.length) {
    const start = Math.max(0, workflow.routeIndex || 0);
    return route.slice(start, start + 6);
  }
  const results = workflow.resultIds || [];
  if (!results.length) return workflow.activeJobId ? [workflow.activeJobId] : [];
  const start = Math.max(0, workflow.selectedIndex || 0);
  return results.slice(start, start + 6);
}

function makePath(points: Point[]) {
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

function renderOverlay(surface: HTMLElement, overlay: SVGSVGElement) {
  const workflow = readWorkflow();
  const ids = orderedIds(workflow);
  const surfaceRect = surface.getBoundingClientRect();
  overlay.setAttribute("viewBox", `0 0 ${Math.max(1, surfaceRect.width)} ${Math.max(1, surfaceRect.height)}`);
  overlay.setAttribute("width", String(surfaceRect.width));
  overlay.setAttribute("height", String(surfaceRect.height));

  const points: Point[] = [];
  const current = currentLocationMarker();
  if (current) {
    const point = pointFor(current, surfaceRect, "current", "You");
    if (point) points.push(point);
  }

  ids.forEach((id, index) => {
    const marker = markerFor(id);
    if (!marker) return;
    const point = pointFor(marker, surfaceRect, id, String(index + 1));
    if (point) points.push(point);
  });

  const visibleIds = points.map((point) => point.id).join("|");
  if (overlay.dataset.signature === visibleIds && overlay.dataset.width === String(Math.round(surfaceRect.width)) && overlay.dataset.height === String(Math.round(surfaceRect.height))) return;
  overlay.dataset.signature = visibleIds;
  overlay.dataset.width = String(Math.round(surfaceRect.width));
  overlay.dataset.height = String(Math.round(surfaceRect.height));

  if (points.length < 2) {
    overlay.innerHTML = "";
    overlay.classList.remove("is-visible");
    return;
  }

  const path = makePath(points);
  const dots = points.map((point, index) => {
    const currentPoint = index === 0 && point.id === "current";
    return `<g class="hpd-suggested-route-stop ${currentPoint ? "current" : "job"}">
      <circle cx="${point.x}" cy="${point.y}" r="${currentPoint ? 10 : 13}" />
      <text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle">${currentPoint ? "●" : point.label}</text>
    </g>`;
  }).join("");

  overlay.innerHTML = `
    <defs>
      <filter id="hpd-route-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="blur" />
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

export default function MapSuggestedRouteOverlay() {
  useEffect(() => {
    let overlay: SVGSVGElement | null = null;
    let surface: HTMLElement | null = null;
    let frame = 0;
    let destroyed = false;

    const ensure = () => {
      if (destroyed) return;
      const nextSurface = mapSurface();
      if (!nextSurface) return;
      surface = nextSurface;
      const computed = window.getComputedStyle(surface);
      if (computed.position === "static") surface.style.position = "relative";

      if (!overlay || overlay.parentElement !== surface) {
        overlay?.remove();
        overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.classList.add("hpd-suggested-route-overlay");
        overlay.setAttribute("aria-hidden", "true");
        surface.appendChild(overlay);
      }
      renderOverlay(surface, overlay);
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
    const timer = window.setInterval(schedule, 500);
    window.addEventListener("resize", schedule);
    window.addEventListener("storage", schedule);

    return () => {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("storage", schedule);
      overlay?.remove();
    };
  }, []);

  return null;
}
