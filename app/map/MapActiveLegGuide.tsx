"use client";

import { useEffect } from "react";

const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;
const ACTIVE_INDEX_KEY = "hpd-active-leg-index-v1";

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function mapElement() {
  return (
    document.querySelector<HTMLElement>(".map-shell .leaflet-container") ||
    document.querySelector<HTMLElement>(".map-shell .maplibregl-map") ||
    document.querySelector<HTMLElement>(".map-shell .mapboxgl-map") ||
    document.querySelector<HTMLElement>(".map-shell [class*='map-stage']")
  );
}

function centerOf(element: HTMLElement, mapRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    x: rect.left - mapRect.left + rect.width / 2,
    y: rect.top - mapRect.top + rect.height / 2,
  };
}

function currentLocationMarker(mapRect: DOMRect) {
  const selectors = [
    ".user-location-marker",
    ".maplibregl-user-location-dot",
    ".mapboxgl-user-location-dot",
    "[data-current-location='true']",
    "[aria-label*='current location' i]",
  ];

  for (const selector of selectors) {
    const marker = document.querySelector<HTMLElement>(selector);
    if (!marker || !marker.getClientRects().length) continue;
    const rect = marker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx >= mapRect.left && cx <= mapRect.right && cy >= mapRect.top && cy <= mapRect.bottom) {
      return marker;
    }
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
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function routeRows() {
  return Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row")).filter(
    (row) => row.getClientRects().length > 0,
  );
}

function routeIdAt(index: number) {
  const row = routeRows()[index];
  return textOf(row).match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "";
}

function stopMarker(id: string, mapRect: DOMRect) {
  if (!id) return null;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], .leaflet-marker-icon, .maplibregl-marker, .mapboxgl-marker",
    ),
  ).filter((marker) => marker.getClientRects().length > 0 && !marker.closest(".hpd-active-leg-guide"));

  return (
    candidates.find((marker) => {
      if (!markerIdentity(marker).includes(id)) return false;
      const rect = marker.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return cx >= mapRect.left && cx <= mapRect.right && cy >= mapRect.top && cy <= mapRect.bottom;
    }) || null
  );
}

function readActiveIndex() {
  const value = Number(sessionStorage.getItem(ACTIVE_INDEX_KEY) || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function writeActiveIndex(index: number) {
  sessionStorage.setItem(ACTIVE_INDEX_KEY, String(Math.max(0, index)));
}

export default function MapActiveLegGuide() {
  useEffect(() => {
    let destroyed = false;
    let frame = 0;
    let svg: SVGSVGElement | null = null;
    let status: HTMLDivElement | null = null;

    const render = () => {
      if (destroyed) return;
      const map = mapElement();
      if (!map) return;
      if (getComputedStyle(map).position === "static") map.style.position = "relative";

      if (!svg || svg.parentElement !== map) {
        svg?.remove();
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("hpd-active-leg-guide");
        Object.assign(svg.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          zIndex: "655",
          pointerEvents: "none",
          overflow: "hidden",
        });
        map.appendChild(svg);
      }

      if (!status || status.parentElement !== map) {
        status?.remove();
        status = document.createElement("div");
        status.className = "hpd-active-leg-status";
        Object.assign(status.style, {
          position: "absolute",
          left: "50%",
          bottom: "18px",
          transform: "translateX(-50%)",
          zIndex: "905",
          padding: "8px 12px",
          borderRadius: "999px",
          background: "rgba(8,24,44,.94)",
          color: "#fff",
          fontSize: "12px",
          fontWeight: "900",
          boxShadow: "0 10px 26px rgba(15,23,42,.25)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        });
        map.appendChild(status);
      }

      const rows = routeRows();
      const maxIndex = Math.max(0, rows.length - 1);
      const activeIndex = Math.min(readActiveIndex(), maxIndex);
      const activeId = routeIdAt(activeIndex);
      const rect = map.getBoundingClientRect();
      const you = currentLocationMarker(rect);
      const stop = stopMarker(activeId, rect);

      if (!you || !stop || !activeId) {
        svg.innerHTML = "";
        status.textContent = !you
          ? "Turn on location to show YOU → 1"
          : !rows.length
            ? "Start a route to show YOU → 1"
            : "Active stop marker is not visible";
        return;
      }

      const start = centerOf(you, rect);
      const end = centerOf(stop, rect);
      if (!start || !end) return;

      svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
      const path = `M${start.x.toFixed(1)},${start.y.toFixed(1)} L${end.x.toFixed(1)},${end.y.toFixed(1)}`;
      const signature = `${activeId}:${path}`;
      if (svg.dataset.signature === signature) return;
      svg.dataset.signature = signature;

      svg.innerHTML = `
        <path id="hpd-active-leg-path" d="${path}" fill="none" stroke="rgba(255,255,255,.98)" stroke-width="12" stroke-linecap="round" />
        <path d="${path}" fill="none" stroke="#1677ff" stroke-width="7" stroke-linecap="round" />
        <circle cx="${start.x}" cy="${start.y}" r="16" fill="#0ea56b" stroke="#fff" stroke-width="3" />
        <text x="${start.x}" y="${start.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="900">YOU</text>
        <circle cx="${end.x}" cy="${end.y}" r="18" fill="#ff8a00" stroke="#fff" stroke-width="3" />
        <text x="${end.x}" y="${end.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="12" font-weight="900">${activeIndex + 1}</text>
        <circle r="5" fill="#e8fbff" stroke="#1677ff" stroke-width="2">
          <animateMotion dur="2.8s" repeatCount="indefinite"><mpath href="#hpd-active-leg-path" /></animateMotion>
        </circle>
      `;
      status.textContent = activeIndex === 0 ? `YOU → 1 · ${activeId}` : `${activeIndex} → ${activeIndex + 1} · ${activeId}`;
    };

    const schedule = () => {
      if (destroyed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest<HTMLElement>(".map-day-route-stop-row");
      if (row) {
        const rows = routeRows();
        const index = rows.indexOf(row);
        if (index >= 0) writeActiveIndex(index);
      }
      schedule();
    };

    render();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const timer = window.setInterval(schedule, 300);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      destroyed = true;
      observer.disconnect();
      clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      svg?.remove();
      status?.remove();
    };
  }, []);

  return null;
}
