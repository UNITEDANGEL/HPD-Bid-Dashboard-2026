"use client";

import { useEffect } from "react";

type SavedWorkflow = {
  routeIds?: string[];
  resultIds?: string[];
};

type Point = {
  x: number;
  y: number;
  label: string;
  id: string;
  start?: boolean;
};

const STORAGE_KEY = "hpd-unified-workflow-v1";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;

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

function routeIdsFromUi() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
  const ids = rows
    .map((row) => textOf(row).match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "")
    .filter(Boolean);
  if (ids.length) return Array.from(new Set(ids)).slice(0, 6);

  const saved = readSaved();
  return (saved.routeIds?.length ? saved.routeIds : saved.resultIds || []).slice(0, 6);
}

function mapElement() {
  return (
    document.querySelector<HTMLElement>(".map-shell .maplibregl-map") ||
    document.querySelector<HTMLElement>(".map-shell .mapboxgl-map") ||
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

function jobMarker(id: string) {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], .maplibregl-marker, .mapboxgl-marker",
    ),
  );
  return candidates.find((marker) => markerIdentity(marker).includes(id.toUpperCase())) || null;
}

function locationMarker() {
  const selectors = [
    ".maplibregl-user-location-dot",
    ".mapboxgl-user-location-dot",
    ".map-current-location-marker",
    ".map-user-location-marker",
    "[data-current-location='true']",
    "[aria-label*='current location' i]",
  ];
  for (const selector of selectors) {
    const found = document.querySelector<HTMLElement>(selector);
    if (found && found.getClientRects().length) return found;
  }
  return null;
}

function centerOf(element: HTMLElement, mapRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    x: rect.left - mapRect.left + rect.width / 2,
    y: rect.top - mapRect.top + rect.height / 2,
  };
}

function pathFor(points: Point[]) {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function draw(map: HTMLElement, svg: SVGSVGElement) {
  const rect = map.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  svg.setAttribute("width", String(rect.width));
  svg.setAttribute("height", String(rect.height));

  const ids = routeIdsFromUi();
  const points: Point[] = [];

  const current = locationMarker();
  const currentPoint = current ? centerOf(current, rect) : null;
  points.push({
    x: currentPoint?.x ?? Math.max(28, rect.width * 0.12),
    y: currentPoint?.y ?? Math.max(40, rect.height * 0.82),
    label: currentPoint ? "YOU" : "START",
    id: "start",
    start: true,
  });

  ids.forEach((id, index) => {
    const marker = jobMarker(id);
    if (!marker) return;
    const point = centerOf(marker, rect);
    if (!point) return;
    points.push({ x: point.x, y: point.y, label: String(index + 1), id });
  });

  const signature = points.map((p) => `${p.id}:${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
  if (svg.dataset.signature === signature) return;
  svg.dataset.signature = signature;

  if (points.length < 2) {
    svg.innerHTML = "";
    svg.classList.remove("is-visible");
    return;
  }

  const path = pathFor(points);
  const nodes = points
    .map(
      (point) => `
      <g class="hpd-live-route-node ${point.start ? "start" : "stop"}">
        <circle cx="${point.x}" cy="${point.y}" r="${point.start ? 9 : 12}" />
        <text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle">${point.start ? "●" : point.label}</text>
      </g>`,
    )
    .join("");

  svg.innerHTML = `
    <defs>
      <marker id="hpd-live-route-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L8,3 z" />
      </marker>
    </defs>
    <path class="hpd-live-route-casing" d="${path}" />
    <path class="hpd-live-route-line" d="${path}" marker-end="url(#hpd-live-route-arrow)" />
    ${nodes}
  `;
  svg.classList.add("is-visible");
}

export default function MapVisibleRouteGuide() {
  useEffect(() => {
    let svg: SVGSVGElement | null = null;
    let map: HTMLElement | null = null;
    let frame = 0;
    let destroyed = false;

    const render = () => {
      if (destroyed) return;
      const nextMap = mapElement();
      if (!nextMap) return;
      map = nextMap;
      if (window.getComputedStyle(map).position === "static") map.style.position = "relative";
      if (!svg || svg.parentElement !== map) {
        svg?.remove();
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("hpd-live-route-guide");
        svg.setAttribute("aria-hidden", "true");
        map.appendChild(svg);
      }
      draw(map, svg);
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
    const timer = window.setInterval(schedule, 100);
    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("storage", schedule);

    return () => {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      clearInterval(timer);
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("storage", schedule);
      svg?.remove();
    };
  }, []);

  return null;
}
