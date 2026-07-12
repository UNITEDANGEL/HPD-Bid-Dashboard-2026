"use client";

import { useEffect } from "react";

const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function visibleButton(pattern: RegExp) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => !button.disabled && button.getClientRects().length > 0 && pattern.test(textOf(button)),
  );
}

function routeStops() {
  const route = document.querySelector<HTMLElement>(".hpd-unified-route");
  if (!route) return [];
  const ids: string[] = [];
  route.querySelectorAll<HTMLElement>("button, article, [class*='stop']").forEach((node) => {
    const id = textOf(node).match(JOB_ID_PATTERN)?.[0]?.toUpperCase();
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

function mapElement() {
  return (
    document.querySelector<HTMLElement>(".map-shell .leaflet-container") ||
    document.querySelector<HTMLElement>(".map-shell .maplibregl-map") ||
    document.querySelector<HTMLElement>(".map-shell .mapboxgl-map")
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

function markerFor(id: string, mapRect: DOMRect) {
  const markers = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".maturity-map-marker, [data-omo], [data-job-id], [class*='job-marker'], .leaflet-marker-icon, .maplibregl-marker, .mapboxgl-marker",
    ),
  );
  return (
    markers.find((marker) => {
      if (!marker.getClientRects().length || !markerIdentity(marker).includes(id)) return false;
      const rect = marker.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return x >= mapRect.left && x <= mapRect.right && y >= mapRect.top && y <= mapRect.bottom;
    }) || null
  );
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
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x >= mapRect.left && x <= mapRect.right && y >= mapRect.top && y <= mapRect.bottom) return marker;
  }
  return null;
}

function centerOf(element: HTMLElement, mapRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - mapRect.left + rect.width / 2,
    y: rect.top - mapRect.top + rect.height / 2,
  };
}

export default function MapAIRouteReview() {
  useEffect(() => {
    let destroyed = false;
    let host: HTMLDivElement | null = null;
    let svg: SVGSVGElement | null = null;

    const remove = () => {
      host?.remove();
      svg?.remove();
      host = null;
      svg = null;
      document.body.classList.remove("hpd-ai-route-ready");
    };

    const render = () => {
      if (destroyed) return;
      const routePanel = document.querySelector<HTMLElement>(".hpd-unified-route");
      const ids = routeStops();
      if (!routePanel || !ids.length) {
        remove();
        return;
      }

      document.body.classList.add("hpd-ai-route-ready");

      if (!host) {
        host = document.createElement("div");
        host.className = "hpd-ai-route-review-bar";
        document.body.appendChild(host);
      }

      host.innerHTML = `
        <div class="hpd-ai-route-review-copy">
          <span>AI ROUTE READY</span>
          <strong>${ids.length} stops selected</strong>
          <small>Review the numbered route, then start at Stop 1.</small>
        </div>
        <div class="hpd-ai-route-review-stops">${ids
          .map((id, index) => `<span><b>${index + 1}</b>${id}</span>`)
          .join("")}</div>
        <div class="hpd-ai-route-review-actions">
          <button type="button" data-action="edit">EDIT ROUTE</button>
          <button type="button" class="primary" data-action="start">START ROUTE</button>
        </div>
      `;

      host.querySelector<HTMLButtonElement>("[data-action='start']")?.addEventListener("click", () => {
        const nativeStart = visibleButton(/^Enroute Stop 1$/i) || visibleButton(/^Enroute/i);
        nativeStart?.click();
      });
      host.querySelector<HTMLButtonElement>("[data-action='edit']")?.addEventListener("click", () => {
        visibleButton(/^Back to Jobs$/i)?.click();
      });

      const map = mapElement();
      if (!map) return;
      if (getComputedStyle(map).position === "static") map.style.position = "relative";
      const rect = map.getBoundingClientRect();
      const you = currentLocationMarker(rect);
      const stopMarkers = ids.map((id) => markerFor(id, rect)).filter((item): item is HTMLElement => Boolean(item));
      const points = [you, ...stopMarkers].filter((item): item is HTMLElement => Boolean(item)).map((item) => centerOf(item, rect));

      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("hpd-ai-route-highlight");
        map.appendChild(svg);
      }
      svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);

      if (points.length < 2) {
        svg.innerHTML = "";
        return;
      }

      const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
      svg.innerHTML = `
        <defs>
          <marker id="hpd-route-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#0b6cff" />
          </marker>
        </defs>
        <path d="${path}" fill="none" stroke="rgba(255,255,255,.96)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
        <path d="${path}" fill="none" stroke="#0b6cff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#hpd-route-arrow)" />
        ${points
          .map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="${index === 0 ? 15 : 17}" fill="${index === 0 ? "#0b9f6e" : "#ff8a00"}" stroke="#fff" stroke-width="3" /><text x="${point.x}" y="${point.y + 1}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="${index === 0 ? 8 : 12}" font-weight="900">${index === 0 ? "YOU" : index}</text>`)
          .join("")}
      `;
    };

    render();
    const observer = new MutationObserver(render);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = window.setInterval(render, 500);
    window.addEventListener("resize", render);
    window.addEventListener("scroll", render, true);

    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", render);
      window.removeEventListener("scroll", render, true);
      remove();
    };
  }, []);

  return null;
}
