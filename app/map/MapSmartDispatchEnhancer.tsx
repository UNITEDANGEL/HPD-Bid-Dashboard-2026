"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;
type Point = { lat: number; lng: number };
type IndexedJob = {
  id: string;
  address: string;
  borough: string;
  status: string;
  access: string;
  description: string;
  appointment: string;
  lat?: number;
  lng?: number;
};

type TripEstimate = {
  straightMiles: number;
  roadMiles: number;
  driveMinutes: number;
  arrivalAt: Date;
};

const BASE_POINT: Point = { lat: 40.6992, lng: -73.8357 };
const BASE_LABEL = "Richmond Hill base";
const CITY_DRIVE_MPH = 14;
const ROAD_FACTOR = 1.24;
const PARKING_BUFFER_MINUTES = 4;
const FIELD_STOP_MINUTES = 40;
const ACTIVE_TRIP_STORAGE_KEY = "hpd-ai-active-trip-v1";

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(job[key]);
    if (value) return value;
  }
  return "";
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, length: number) {
  const normalized = clean(value);
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length).trim()}…`;
}

function distanceMiles(a: Point, b: Point) {
  const radius = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function estimateTrip(origin: Point, destination: Point, departAt = new Date()): TripEstimate {
  const straightMiles = distanceMiles(origin, destination);
  const roadMiles = Math.max(0.3, straightMiles * ROAD_FACTOR);
  const driveMinutes = Math.max(5, Math.round((roadMiles / CITY_DRIVE_MPH) * 60 + PARKING_BUFFER_MINUTES));
  return {
    straightMiles,
    roadMiles,
    driveMinutes,
    arrivalAt: new Date(departAt.getTime() + driveMinutes * 60_000),
  };
}

function normalizedAddress(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const JOBS = new Map<string, IndexedJob>();
const JOBS_BY_ADDRESS = new Map<string, IndexedJob>();

for (const raw of bundledJobsData as JobRecord[]) {
  const id = firstValue(raw, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  if (!id) continue;
  const lat = numericValue(raw.Latitude ?? raw.latitude ?? raw.lat);
  const lng = numericValue(raw.Longitude ?? raw.longitude ?? raw.lng ?? raw.lon);
  const address = firstValue(raw, ["BuildingAddress", "Building_Address", "Address", "address", "location"]);
  const job: IndexedJob = {
    id,
    address,
    borough: firstValue(raw, ["Borough", "borough", "Boro", "boro"]),
    status: [
      firstValue(raw, ["WorkflowStatus"]),
      firstValue(raw, ["StatusOverride"]),
      firstValue(raw, ["FieldOutcome"]),
      firstValue(raw, ["status", "Status"]),
    ].filter(Boolean).join(" · "),
    access: firstValue(raw, ["ItbTenantAccessType", "ItbTenantContactStatus", "Location", "location"]),
    description: firstValue(raw, ["ItbPage3Description", "JobDescription", "Job_Description", "description"]),
    appointment: firstValue(raw, ["AppointmentAt", "appointmentAt"]),
    lat: lat || undefined,
    lng: lng || undefined,
  };
  JOBS.set(id, job);
  if (address) JOBS_BY_ADDRESS.set(normalizedAddress(address), job);
}

function resolveJob(id: string, address: string) {
  const direct = JOBS.get(id.toUpperCase());
  if (direct) return direct;
  const normalized = normalizedAddress(address);
  if (!normalized) return null;
  const exact = JOBS_BY_ADDRESS.get(normalized);
  if (exact) return exact;
  for (const [key, job] of JOBS_BY_ADDRESS) {
    if (key.includes(normalized) || normalized.includes(key)) return job;
  }
  return null;
}

function pointFor(job: IndexedJob | null) {
  return job?.lat && job?.lng ? { lat: job.lat, lng: job.lng } : null;
}

function urgencyReason(job: IndexedJob | null, cardReason: string) {
  const combined = `${job?.status || ""} ${cardReason} ${job?.appointment || ""}`.toLowerCase();
  if (/appointment/.test(combined)) return "Appointment or scheduled access";
  if (/ready.*second|second attempt/.test(combined)) return "Ready for second attempt";
  if (/overdue/.test(combined)) return "Overdue field action";
  if (/urgent|emergency|priority/.test(combined)) return "Urgent work indicator";
  if (/no\s*access|refus/.test(combined)) return "No Access follow-up";
  return "Closest practical active stop";
}

function priorityScore(job: IndexedJob | null, reason: string, miles: number) {
  const combined = `${job?.status || ""} ${reason} ${job?.appointment || ""}`.toLowerCase();
  let score = Math.max(0, 36 - miles * 2.4);
  if (/appointment/.test(combined)) score += 130;
  if (/ready.*second|second attempt/.test(combined)) score += 115;
  if (/overdue/.test(combined)) score += 100;
  if (/urgent|emergency|priority/.test(combined)) score += 90;
  if (/no\s*access|refus/.test(combined)) score += 65;
  return score;
}

function setHtml(node: HTMLElement, html: string) {
  if (node.innerHTML !== html) node.innerHTML = html;
}

function activeTripPhase() {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    if (!raw) return null;
    const trip = JSON.parse(raw) as { status?: string };
    return trip?.status || null;
  } catch {
    return null;
  }
}

export default function MapSmartDispatchEnhancer() {
  useEffect(() => {
    let origin = BASE_POINT;
    let originLabel = BASE_LABEL;
    let locationRequested = false;
    let scheduled = false;
    let destroyed = false;

    const requestLocation = () => {
      if (!navigator.geolocation) return;
      locationRequested = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          origin = { lat: position.coords.latitude, lng: position.coords.longitude };
          originLabel = "your current location";
          locationRequested = false;
          scheduleEnhance();
        },
        () => {
          origin = BASE_POINT;
          originLabel = BASE_LABEL;
          locationRequested = false;
          scheduleEnhance();
        },
        { enableHighAccuracy: true, maximumAge: 90_000, timeout: 8_000 },
      );
    };

    const ensureFlowStrip = () => {
      const center = document.querySelector<HTMLElement>(".hpd-ai-center");
      const quick = center?.querySelector<HTMLElement>(".hpd-ai-quick-strip");
      if (!center || !quick) return;

      let flow = center.querySelector<HTMLElement>(".hpd-ai-smart-flow");
      if (!flow) {
        flow = document.createElement("section");
        flow.className = "hpd-ai-smart-flow";
        flow.setAttribute("aria-label", "Field workflow");
        quick.insertAdjacentElement("afterend", flow);
      }

      const hasResults = Boolean(document.querySelector(".hpd-ai-result-list .hpd-ai-list-main"));
      const hasRoute = Boolean(document.querySelector(".hpd-ai-route-list > li"));
      const jobOpen = document.body.classList.contains("hpd-full-job-open");
      const trip = activeTripPhase();
      let active = hasRoute ? 1 : hasResults ? 1 : 0;
      if (trip === "enroute") active = 2;
      if (trip === "arrived") active = jobOpen ? 4 : 3;

      const steps = ["Plan", "Review", "Enroute", "Arrive", "Complete", "Next"];
      setHtml(
        flow,
        steps.map((step, index) => `<span class="${index < active ? "done" : index === active ? "active" : ""}"><b>${index + 1}</b><small>${step}</small></span>`).join("<i>›</i>"),
      );
    };

    const enhanceResults = () => {
      const panel = document.querySelector<HTMLElement>(".hpd-ai-results-panel");
      const list = panel?.querySelector<HTMLElement>(".hpd-ai-result-list");
      const head = panel?.querySelector<HTMLElement>(".hpd-ai-section-head");
      if (!panel || !list || !head) return;

      const mainButtons = Array.from(list.querySelectorAll<HTMLButtonElement>(":scope > .hpd-ai-list-main, :scope > button:not(.hpd-ai-enroute)"));
      if (!mainButtons.length) return;

      const now = new Date();
      const items = mainButtons.map((button, index) => {
        button.classList.add("hpd-ai-list-main");
        const id = textOf(button.querySelector("span strong")).toUpperCase();
        const address = textOf(button.querySelector("span small"));
        const reason = textOf(button.querySelector("span em"));
        const job = resolveJob(id, address);
        const destination = pointFor(job);
        const estimate = destination ? estimateTrip(origin, destination, now) : null;
        const score = estimate ? priorityScore(job, reason, estimate.roadMiles) : 0;
        return { button, index, id, address, reason, job, destination, estimate, score };
      });

      for (const item of items) {
        const content = item.button.querySelector<HTMLElement>("span");
        if (!content) continue;
        let meta = content.querySelector<HTMLElement>(".hpd-ai-result-intel");
        if (!meta) {
          meta = document.createElement("span");
          meta.className = "hpd-ai-result-intel";
          content.appendChild(meta);
        }

        const estimateHtml = item.estimate
          ? `<b>${item.estimate.roadMiles.toFixed(1)} mi</b><b>${item.estimate.driveMinutes} min</b><b>ETA ${formatClock(item.estimate.arrivalAt)}</b>`
          : `<b>Distance unavailable</b>`;
        const access = truncate(item.job?.access || "Access not listed", 42);
        const scope = truncate(item.job?.description || item.reason || "Active job", 78);
        setHtml(meta, `<span class="hpd-ai-result-metrics">${estimateHtml}</span><small><strong>Access:</strong> ${access}</small><small><strong>Work:</strong> ${scope}</small>`);
      }

      const ranked = items.filter((item) => item.estimate).sort((a, b) => b.score - a.score || (a.estimate?.roadMiles || 999) - (b.estimate?.roadMiles || 999));
      const recommended = ranked[0] || items[0];
      const totalDrive = items.reduce((sum, item) => sum + (item.estimate?.driveMinutes || 0), 0);
      const totalMiles = items.reduce((sum, item) => sum + (item.estimate?.roadMiles || 0), 0);
      const fieldMinutes = items.length * FIELD_STOP_MINUTES;
      const finish = new Date(now.getTime() + (totalDrive + fieldMinutes) * 60_000);

      let summary = panel.querySelector<HTMLElement>(".hpd-ai-smart-summary");
      if (!summary) {
        summary = document.createElement("section");
        summary.className = "hpd-ai-smart-summary";
        head.insertAdjacentElement("afterend", summary);
      }

      const recommendedEta = recommended.estimate ? `${recommended.estimate.roadMiles.toFixed(1)} mi · ${recommended.estimate.driveMinutes} min · ETA ${formatClock(recommended.estimate.arrivalAt)}` : "Distance unavailable";
      const recommendationReason = urgencyReason(recommended.job, recommended.reason);
      setHtml(
        summary,
        `<div class="hpd-ai-smart-summary-head"><span>AI Dispatch Summary</span><b>Start with ${recommended.id || `job ${recommended.index + 1}`}</b><small>${recommendationReason}</small></div>
         <div class="hpd-ai-smart-summary-grid"><article><span>First stop</span><b>${recommendedEta}</b></article><article><span>List total</span><b>${items.length} jobs · ${totalMiles.toFixed(1)} mi</b></article><article><span>Estimated day</span><b>${formatMinutes(totalDrive + fieldMinutes)} · finish ${formatClock(finish)}</b></article><article><span>Calculated from</span><b>${originLabel}</b></article></div>
         <div class="hpd-ai-smart-summary-actions"><button type="button" class="primary" data-smart-action="start">Start recommended</button><button type="button" data-smart-action="location">${locationRequested ? "Locating…" : "Use my location"}</button><button type="button" data-smart-action="route">Build full route</button></div>`,
      );

      const start = summary.querySelector<HTMLButtonElement>('[data-smart-action="start"]');
      if (start) {
        start.onclick = () => {
          const enroute = document.querySelector<HTMLButtonElement>(`.hpd-ai-enroute[data-enroute-for="${recommended.id}"]`);
          enroute?.click();
        };
      }
      const location = summary.querySelector<HTMLButtonElement>('[data-smart-action="location"]');
      if (location) location.onclick = requestLocation;
      const route = summary.querySelector<HTMLButtonElement>('[data-smart-action="route"]');
      if (route) {
        route.onclick = () => {
          const build = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((button) => /build route/i.test(textOf(button)));
          build?.click();
        };
      }
    };

    const enhanceRoute = () => {
      const panel = document.querySelector<HTMLElement>(".hpd-ai-route-panel");
      const list = panel?.querySelector<HTMLOListElement>(".hpd-ai-route-list");
      const routeCard = panel?.querySelector<HTMLElement>(".hpd-ai-route-card");
      if (!panel || !list || !routeCard) return;

      const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > li"));
      if (!rows.length) return;

      let previousPoint = origin;
      let cursor = new Date();
      let totalMiles = 0;
      let totalDriveMinutes = 0;

      rows.forEach((row, index) => {
        const main = row.querySelector<HTMLButtonElement>(":scope > .hpd-ai-list-main, :scope > button:not(.hpd-ai-enroute)");
        if (!main) return;
        const id = textOf(main.querySelector("span strong")).toUpperCase();
        const detail = textOf(main.querySelector("span small"));
        const job = resolveJob(id, detail);
        const destination = pointFor(job);
        const estimate = destination ? estimateTrip(previousPoint, destination, cursor) : null;
        if (estimate) {
          totalMiles += estimate.roadMiles;
          totalDriveMinutes += estimate.driveMinutes;
          cursor = new Date(estimate.arrivalAt.getTime() + FIELD_STOP_MINUTES * 60_000);
          previousPoint = destination as Point;
        }

        const content = main.querySelector<HTMLElement>("span");
        if (!content) return;
        let meta = content.querySelector<HTMLElement>(".hpd-ai-route-intel");
        if (!meta) {
          meta = document.createElement("span");
          meta.className = "hpd-ai-route-intel";
          content.appendChild(meta);
        }
        setHtml(meta, estimate ? `<b>Leg ${index + 1}</b><b>${estimate.roadMiles.toFixed(1)} mi</b><b>${estimate.driveMinutes} min</b><b>ETA ${formatClock(estimate.arrivalAt)}</b>` : `<b>Leg ${index + 1}</b><b>ETA unavailable</b>`);
      });

      let summary = panel.querySelector<HTMLElement>(".hpd-ai-route-smart-summary");
      if (!summary) {
        summary = document.createElement("section");
        summary.className = "hpd-ai-route-smart-summary";
        routeCard.insertAdjacentElement("afterend", summary);
      }
      const fieldMinutes = rows.length * FIELD_STOP_MINUTES;
      setHtml(summary, `<span>Route intelligence</span><b>${totalMiles.toFixed(1)} mi · ${formatMinutes(totalDriveMinutes)} driving</b><small>${rows.length} stops · about ${formatMinutes(totalDriveMinutes + fieldMinutes)} total · finish around ${formatClock(cursor)}</small>`);
    };

    const enhance = () => {
      if (destroyed) return;
      ensureFlowStrip();
      enhanceResults();
      enhanceRoute();
    };

    function scheduleEnhance() {
      if (scheduled || destroyed) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        enhance();
      });
    }

    scheduleEnhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const interval = window.setInterval(scheduleEnhance, 850);
    window.addEventListener("hpd-map-enroute", scheduleEnhance);
    window.addEventListener("hpd-map-arrived", scheduleEnhance);

    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("hpd-map-enroute", scheduleEnhance);
      window.removeEventListener("hpd-map-arrived", scheduleEnhance);
    };
  }, []);

  return null;
}
