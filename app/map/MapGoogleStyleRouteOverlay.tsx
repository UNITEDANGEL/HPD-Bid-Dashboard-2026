"use client";

import { useEffect } from "react";

type SavedWorkflow = { resultIds?: string[]; routeIds?: string[]; activeJobId?: string };
type Point = { x: number; y: number; id: string; label: string; current: boolean };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const MAP_SELECTORS = [
  ".map-shell .maplibregl-map",
  ".map-shell .mapboxgl-map",
  ".map-shell [class*='map-canvas']",
  ".map-shell [class*='map-stage']",
];
const CURRENT_SELECTORS = [
  ".mapboxgl-user-location-dot",
  ".maplibregl-user-location-dot",
  ".map-current-location-marker",
  ".map-user-location-marker",
  ".current-location-marker",
  "[data-current-location='true']",
  "[aria-label*='current location' i]",
  "[title*='current location' i]",
  "[aria-label*='your location' i]",
  "[title*='your location' i]",
  "[aria-label*='base' i]",
  "[title*='base' i]",
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

function routeOrderFromDom() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
  const ids = rows
    .map((row) => textOf(row).match(/\b[A-Z]{2}\d{4,7}\b/i)?.[0]?.toUpperCase() || "")
    .filter(Boolean);
  if (ids.length) return Array.from(new Set(ids)).slice(0, 6);

  const chips = Array.from(document.querySelectorAll<HTMLElement>(".hpd-route-stop-chips button"));
  const chipIds = chips
    .map((chip) => textOf(chip).match(/\b[A-Z]{2}\d{4,7}\b/i)?.[0]?.toUpperCase() || "")
    .filter(Boolean);
  return Array.from(new Set(chipIds)).slice(0, 6);
}

function orderedIds() {
  const domOrder = routeOrderFromDom();
  if (domOrder.length) return domOrder;
  const workflow = readWorkflow();
  if (workflow.routeIds?.length) return workflow.routeIds.slice(0, 6);
  if (workflow.resultIds?.length) return workflow.resultIds.slice(0, 6);
  return workflow.activeJobId ? [workflow.activeJobId] : [];
}

function mapSurface() {
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

function findMarker(id: string) {
  const normalized = id.toUpperCase();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], [class*='map-marker']",
  ));
  return candidates.find((marker) => markerIdentity(marker).includes(normalized)) || null;
}

function findCurrentMarker() {
  for (const selector of CURRENT_SELECTORS) {
    const marker = document.querySelector<HTMLElement>(selector);
    if (marker && marker.getClientRects().length > 0) return marker;
  }
  return null;
}

function pointFor(element: HTMLElement, surfaceRect: DOMRect, id: string, label: string, current: boolean): Point | null {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  const x = rect.left - surfaceRect.left + rect.width / 2;
  const y = rect.top - surfaceRect.top + rect.height / 2;
  if (x < -60 || y < -60 || x > surfaceRect.width + 60 || y > surfaceRect.height + 60) return null;
  return { x, y, id, label, current };
}

function startPoint(surfaceRect: DOMRect): Point {
  return {
    x: Math.max(24, Math.min(surfaceRect.width - 24, surfaceRect.width * 0.5)),
    y: Math.max(24, Math.min(surfaceRect.height - 24, surfaceRect.height * 0.72)),
    id: "start",
    label: "You",
    current: true,
  };
}

function pathFor(points: Point[]) {
  if (points.length < 2) return "";
  const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const middleX = (previous.x + current.x) / 2;
    commands.push(`C ${middleX.toFixed(1)} ${previous.y.toFixed(1)}, ${middleX.toFixed(1)} ${current.y.toFixed(1)}, ${current.x.toFixed(1)} ${current.y.toFixed(1)}`);
  }
  return commands.join(" ");
}

function render(surface: HTMLElement, overlay: SVGSVGElement) {
  const ids = orderedIds();
  const surfaceRect = surface.getBoundingClientRect();
  overlay.setAttribute("viewBox", `0 0 ${Math.max(1, surfaceRect.width)} ${Math.max(1, surfaceRect.height)}`);
  overlay.setAttribute("width", String(surfaceRect.width));
  overlay.setAttribute("height", String(surfaceRect.height));
  overlay.setAttribute("preserveAspectRatio", "none");

  const currentMarker = findCurrentMarker();
  const currentPoint = currentMarker ? pointFor(currentMarker, surfaceRect, "current", "You", true) : startPoint(surfaceRect);
  const points: Point[] = currentPoint ? [currentPoint] : [];

  ids.forEach((id, index) => {
    const marker = findMarker(id);
    if (!marker) return;
    const point = pointFor(marker, surfaceRect, id, String(index + 1), false);
    if (point) points.push(point);
  });

  const signature = points.map((point) => `${point.id}:${point.label}:${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|");
  if (overlay.dataset.signature === signature) return;
  overlay.dataset.signature = signature;

  if (points.length < 2) {
    overlay.innerHTML = "";
    overlay.classList.remove("is-visible");
    return;
  }

  const path = pathFor(points);
  const dots = points.map((point) => `
    <g class="hpd-suggested-route-stop ${point.current ? "current" : "job"}">
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

export default function MapGoogleStyleRouteOverlay() {
  useEffect(() => {
    let surface: HTMLElement | null = null;
    let overlay: SVGSVGElement | null = null;
    let frame = 0;
    let destroyed = false;

    const ensure = () => {
      if (destroyed) return;
      const nextSurface = mapSurface();
      if (!nextSurface) return;
      surface = nextSurface;
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
    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("storage", schedule);

    return () => {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("storage", schedule);
      overlay?.remove();
    };
  }, []);

  return null;
}
