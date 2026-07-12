"use client";

import { useEffect } from "react";

type SavedWorkflow = { routeIds?: string[]; resultIds?: string[]; routeIndex?: number };
type Point = { x: number; y: number; id: string; label: string };

const STORAGE_KEY = "hpd-unified-workflow-v1";
const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;
const MAX_YOU_ACCURACY_METERS = 50;

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
  ).filter((marker) => marker.getClientRects().length > 0 && !marker.closest(".hpd-strict-location-guide"));
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

function realLocationMarker(mapRect: DOMRect) {
  const selectors = [
    ".maplibregl-user-location-dot",
    ".mapboxgl-user-location-dot",
    ".map-current-location-marker",
    ".map-user-location-marker",
    "[data-current-location='true']",
    "[aria-label*='current location' i]",
    ".leaflet-marker-icon[title*='location' i]",
  ];
  for (const selector of selectors) {
    const marker = document.querySelector<HTMLElement>(selector);
    if (!marker || !marker.getClientRects().length) continue;
    const point = centerOf(marker, mapRect);
    if (point) return point;
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export default function MapStrictLocationGuide() {
  useEffect(() => {
    let destroyed = false;
    let frame = 0;
    let svg: SVGSVGElement | null = null;
    let dock: HTMLDivElement | null = null;
    let gpsAccuracy: number | null = null;

    const render = () => {
      if (destroyed) return;
      const map = mapElement();
      if (!map) return;
      if (getComputedStyle(map).position === "static") map.style.position = "relative";

      if (!svg || svg.parentElement !== map) {
        svg?.remove();
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("hpd-strict-location-guide");
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
      const stops: Point[] = [];
      for (const id of orderedIds()) {
        const marker = markerFor(id, rect);
        if (!marker) continue;
        const center = centerOf(marker, rect);
        if (!center) continue;
        stops.push({ ...center, id, label: String(stops.length + 1) });
      }

      if (!stops.length) {
        svg.innerHTML = "";
        svg.style.opacity = "0";
        dock.hidden = true;
        return;
      }

      const locationPoint = gpsAccuracy !== null && gpsAccuracy <= MAX_YOU_ACCURACY_METERS ? realLocationMarker(rect) : null;
      const points: Point[] = locationPoint ? [{ ...locationPoint, id: "you", label: "YOU" }, ...stops] : stops;
      const saved = readSaved();
      const requestedIndex = Number.isFinite(saved.routeIndex) ? Number(saved.routeIndex) : 0;
      const activeIndex = Math.max(0, Math.min(stops.length - 1, requestedIndex));
      const signature = `${points.map((point) => `${point.id}:${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|")}|active:${activeIndex}|accuracy:${gpsAccuracy ?? "none"}`;
      if (svg.dataset.signature === signature) return;
      svg.dataset.signature = signature;

      svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
      const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
      const stopOffset = locationPoint ? 1 : 0;
      const nodes = points
        .map((point, index) => {
          if (locationPoint && index === 0) {
            return `<g><circle cx="${point.x}" cy="${point.y}" r="16" fill="#0ea56b" stroke="#fff" stroke-width="3"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="900">YOU</text></g>`;
          }
          const visibleIndex = index - stopOffset;
          const active = visibleIndex === activeIndex;
          return `<g data-visible-index="${visibleIndex}" role="button" style="pointer-events:all;cursor:pointer"><circle cx="${point.x}" cy="${point.y}" r="${active ? 18 : 15}" fill="${active ? "#ff8a00" : "#1677ff"}" stroke="#fff" stroke-width="3"/><text x="${point.x}" y="${point.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="12" font-weight="900" style="pointer-events:none">${visibleIndex + 1}</text></g>`;
        })
        .join("");

      svg.innerHTML = `<path id="hpd-strict-location-path" d="${d}" fill="none" stroke="rgba(255,255,255,.98)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#1677ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><g aria-hidden="true"><circle r="5" fill="#e8fbff" stroke="#1677ff" stroke-width="2"><animateMotion dur="5s" repeatCount="indefinite"><mpath href="#hpd-strict-location-path"/></animateMotion></circle></g>${nodes}`;
      svg.style.opacity = "1";

      const active = stops[activeIndex];
      const status = locationPoint
        ? `YOU confirmed by device location · ±${Math.round(gpsAccuracy || 0)} m`
        : gpsAccuracy === null
          ? "Location unavailable — showing 1 → 2 → 3 only"
          : `Location accuracy too low (±${Math.round(gpsAccuracy)} m) — YOU hidden`;
      dock.innerHTML = `<div style="font-size:12px;font-weight:900">STOP ${activeIndex + 1} · ${escapeHtml(active.id)}</div><div style="font-size:11px;opacity:.78;margin-top:3px">${escapeHtml(status)}</div>`;
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
          gpsAccuracy = position.coords.accuracy;
          if (svg) svg.dataset.signature = "";
          schedule();
        },
        () => {
          gpsAccuracy = null;
          if (svg) svg.dataset.signature = "";
          schedule();
        },
        { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
      );
    }

    render();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const timer = window.setInterval(schedule, 300);
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
