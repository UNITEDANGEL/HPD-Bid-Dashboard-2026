"use client";

import { useEffect } from "react";

const JOB_ID_PATTERN = /\b[A-Z]{2}\d{4,7}\b/i;
const ACTIVE_INDEX_KEY = "hpd-active-leg-index-v2";

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
    if (cx >= mapRect.left && cx <= mapRect.right && cy >= mapRect.top && cy <= mapRect.bottom) return marker;
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

function routeId(row: HTMLElement | undefined) {
  return textOf(row || null).match(JOB_ID_PATTERN)?.[0]?.toUpperCase() || "";
}

function routeAddress(row: HTMLElement | undefined) {
  if (!row) return "";
  const small = row.querySelector("small");
  const raw = textOf(small || row);
  return raw
    .replace(/^\d+\s*(?:min|m|hr|h).*?·\s*/i, "")
    .replace(JOB_ID_PATTERN, "")
    .replace(/^[-·\s]+|[-·\s]+$/g, "")
    .trim();
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

function googleUrl(address: string, id: string) {
  const query = address || id;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function MapActiveLegGuide() {
  useEffect(() => {
    let destroyed = false;
    let frame = 0;
    let svg: SVGSVGElement | null = null;
    let panel: HTMLDivElement | null = null;

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

      if (!panel || panel.parentElement !== map) {
        panel?.remove();
        panel = document.createElement("div");
        panel.className = "hpd-active-leg-panel";
        Object.assign(panel.style, {
          position: "absolute",
          left: "50%",
          bottom: "16px",
          transform: "translateX(-50%)",
          zIndex: "905",
          width: "min(340px, calc(100% - 24px))",
          padding: "12px",
          borderRadius: "16px",
          background: "rgba(8,24,44,.96)",
          color: "#fff",
          boxShadow: "0 12px 30px rgba(15,23,42,.3)",
          fontFamily: "Inter,Arial,sans-serif",
        });
        map.appendChild(panel);
      }

      const rows = routeRows();
      if (!rows.length) {
        svg.innerHTML = "";
        panel.innerHTML = `<div style="font-size:11px;font-weight:900;opacity:.72">ROUTE</div><div style="font-size:15px;font-weight:900;margin-top:2px">Add jobs to today's route</div><div style="font-size:12px;opacity:.78;margin-top:4px">No Start button is needed. The guide begins automatically when route stops appear.</div>`;
        return;
      }

      const maxIndex = Math.max(0, rows.length - 1);
      const activeIndex = Math.min(readActiveIndex(), maxIndex);
      const row = rows[activeIndex];
      const activeId = routeId(row);
      const address = routeAddress(row);
      const rect = map.getBoundingClientRect();
      const you = currentLocationMarker(rect);
      const stop = stopMarker(activeId, rect);

      if (!you || !stop || !activeId) {
        svg.innerHTML = "";
        panel.innerHTML = !you
          ? `<div style="font-size:11px;font-weight:900;opacity:.72">NEXT STOP</div><div style="font-size:15px;font-weight:900;margin-top:2px">Turn on location</div><div style="font-size:12px;opacity:.78;margin-top:4px">The line starts automatically when the YOU marker is visible.</div>`
          : `<div style="font-size:11px;font-weight:900;opacity:.72">NEXT STOP</div><div style="font-size:15px;font-weight:900;margin-top:2px">Stop ${activeIndex + 1}</div><div style="font-size:12px;opacity:.78;margin-top:4px">Move the map until this stop marker is visible.</div>`;
        return;
      }

      const start = centerOf(you, rect);
      const end = centerOf(stop, rect);
      if (!start || !end) return;

      svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
      const path = `M${start.x.toFixed(1)},${start.y.toFixed(1)} L${end.x.toFixed(1)},${end.y.toFixed(1)}`;
      const signature = `${activeId}:${path}`;
      if (svg.dataset.signature !== signature) {
        svg.dataset.signature = signature;
        svg.innerHTML = `
          <path id="hpd-active-leg-path" d="${path}" fill="none" stroke="rgba(255,255,255,.98)" stroke-width="12" stroke-linecap="round" />
          <path d="${path}" fill="none" stroke="#1677ff" stroke-width="7" stroke-linecap="round" />
          <circle cx="${start.x}" cy="${start.y}" r="16" fill="#0ea56b" stroke="#fff" stroke-width="3" />
          <text x="${start.x}" y="${start.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="900">YOU</text>
          <circle cx="${end.x}" cy="${end.y}" r="18" fill="#ff8a00" stroke="#fff" stroke-width="3" />
          <text x="${end.x}" y="${end.y + 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="12" font-weight="900">${activeIndex + 1}</text>
          <circle r="5" fill="#e8fbff" stroke="#1677ff" stroke-width="2"><animateMotion dur="2.8s" repeatCount="indefinite"><mpath href="#hpd-active-leg-path" /></animateMotion></circle>
        `;
      }

      const nextDisabled = activeIndex >= maxIndex;
      panel.innerHTML = `
        <div style="font-size:11px;font-weight:900;opacity:.72">NEXT STOP</div>
        <div style="font-size:17px;font-weight:900;margin-top:2px">YOU → ${activeIndex + 1}</div>
        <div style="font-size:12px;opacity:.82;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${address || activeId}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <a data-nav href="${googleUrl(address, activeId)}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;text-decoration:none;background:#1677ff;color:#fff;border-radius:11px;padding:10px;font-size:12px;font-weight:900">NAVIGATE</a>
          <button data-next type="button" ${nextDisabled ? "disabled" : ""} style="border:0;border-radius:11px;padding:10px 14px;font-size:12px;font-weight:900;background:${nextDisabled ? "rgba(255,255,255,.15)" : "#fff"};color:${nextDisabled ? "rgba(255,255,255,.55)" : "#0f172a"};cursor:${nextDisabled ? "default" : "pointer"}">${nextDisabled ? "LAST STOP" : "NEXT"}</button>
        </div>
      `;

      panel.querySelector<HTMLButtonElement>("[data-next]")?.addEventListener("click", () => {
        if (activeIndex >= maxIndex) return;
        writeActiveIndex(activeIndex + 1);
        if (svg) svg.dataset.signature = "";
        render();
      });
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
      panel?.remove();
    };
  }, []);

  return null;
}
