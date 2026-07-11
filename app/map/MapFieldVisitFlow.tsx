"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TripStatus = "enroute" | "arrived";

type ActiveTrip = {
  id: string;
  address: string;
  lat?: number;
  lng?: number;
  directionsUrl: string;
  status: TripStatus;
  enrouteAt: string;
  arrivedAt?: string;
};

type EnrouteEvent = CustomEvent<ActiveTrip>;

type GeoPoint = { lat: number; lng: number };

const ACTIVE_TRIP_STORAGE_KEY = "hpd-ai-active-trip-v1";
const ENROUTE_EVENT = "hpd-map-enroute";
const ARRIVAL_EVENT = "hpd-map-arrived";
const ARRIVAL_RADIUS_MILES = 0.12;

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readStoredTrip(): ActiveTrip | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTrip;
    return parsed?.id && parsed?.directionsUrl ? parsed : null;
  } catch {
    return null;
  }
}

function saveTrip(trip: ActiveTrip | null) {
  try {
    if (trip) window.localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, JSON.stringify(trip));
    else window.localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    // The flow still works for the current page session.
  }
}

function distanceMiles(a: GeoPoint, b: GeoPoint) {
  const radius = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function selectedJobIdFromDom() {
  const sources = [
    textOf(document.querySelector(".job-drawer.selected-focus")),
    textOf(document.querySelector(".map-job-brief")),
    document.querySelector<HTMLInputElement>(".map-face-search input")?.value || "",
  ];

  for (const source of sources) {
    const match = source.match(/\b[A-Z]{2}\d{4,7}\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isJobCardOpen() {
  return Boolean(document.querySelector(".job-drawer.selected-focus, .map-job-brief"));
}

function collapseAiDispatcher() {
  const collapse = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-header-actions button"))
    .find((button) => /collapse/i.test(textOf(button)));
  collapse?.click();
}

function reopenAiJobSummary() {
  const rail = document.querySelector<HTMLButtonElement>(".hpd-ai-rail");
  rail?.click();

  window.setTimeout(() => {
    const jobTab = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"))
      .find((button) => /^job\b/i.test(textOf(button)));
    jobTab?.click();
  }, 120);
}

function reopenAiChat() {
  const rail = document.querySelector<HTMLButtonElement>(".hpd-ai-rail");
  rail?.click();

  window.setTimeout(() => {
    const chatTab = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"))
      .find((button) => /^chat\b/i.test(textOf(button)));
    chatTab?.click();
  }, 120);
}

function clickFullJobControl() {
  if (document.querySelector(".job-drawer.selected-focus")) return true;
  const brief = document.querySelector<HTMLElement>(".map-job-brief");
  if (!brief) return false;

  const button = Array.from(brief.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.getClientRects().length > 0 && /open.*job|view.*job|full.*job|details|open details/i.test(textOf(candidate)));

  if (button) {
    button.click();
    return true;
  }
  return false;
}

function openCompleteJobCard(id: string) {
  const searchInput = document.querySelector<HTMLInputElement>(".map-face-search input");
  if (searchInput) {
    setNativeInputValue(searchInput, id);
    searchInput.focus();
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (document.querySelector(".job-drawer.selected-focus")) {
      window.clearInterval(timer);
      return;
    }

    const resultButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.getClientRects().length > 0 && textOf(button).toUpperCase().includes(id));
    if (resultButton && !resultButton.closest(".hpd-ai-center")) resultButton.click();
    clickFullJobControl();

    if (attempts >= 8) window.clearInterval(timer);
  }, 280);
}

export default function MapFieldVisitFlow() {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [nearDestination, setNearDestination] = useState(false);
  const [jobCardOpen, setJobCardOpen] = useState(false);
  const tripRef = useRef<ActiveTrip | null>(null);
  const priorJobCardOpenRef = useRef(false);

  useEffect(() => {
    const host = document.createElement("div");
    host.className = "hpd-field-flow-portal";
    document.body.appendChild(host);
    setPortalHost(host);

    const moveHost = () => {
      const target = (document.fullscreenElement as HTMLElement | null) || document.body;
      if (host.parentElement !== target) target.appendChild(host);
    };

    document.addEventListener("fullscreenchange", moveHost);
    moveHost();
    return () => {
      document.removeEventListener("fullscreenchange", moveHost);
      host.remove();
    };
  }, []);

  useEffect(() => {
    const stored = readStoredTrip();
    if (stored) {
      tripRef.current = stored;
      setTrip(stored);
    }

    const onEnroute = (event: Event) => {
      const detail = (event as EnrouteEvent).detail;
      if (!detail?.id) return;
      tripRef.current = detail;
      setTrip(detail);
      setDistance(null);
      setNearDestination(false);
      collapseAiDispatcher();
    };

    window.addEventListener(ENROUTE_EVENT, onEnroute);
    return () => window.removeEventListener(ENROUTE_EVENT, onEnroute);
  }, []);

  useEffect(() => {
    tripRef.current = trip;
    saveTrip(trip);
  }, [trip]);

  useEffect(() => {
    const destination = trip?.lat && trip?.lng ? { lat: trip.lat, lng: trip.lng } : null;
    if (!trip || trip.status !== "enroute" || !destination || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const miles = distanceMiles(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          destination,
        );
        setDistance(miles);
        setNearDestination(miles <= ARRIVAL_RADIUS_MILES);
      },
      () => {
        setDistance(null);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trip?.id, trip?.status, trip?.lat, trip?.lng]);

  useEffect(() => {
    const sync = () => {
      const open = isJobCardOpen();
      const activeTrip = tripRef.current;
      const selectedId = selectedJobIdFromDom();
      const summaryUnlocked = Boolean(
        activeTrip?.status === "arrived" &&
        selectedId &&
        selectedId === activeTrip.id,
      );

      setJobCardOpen(open);
      document.body.classList.toggle("hpd-full-job-open", open);
      document.body.classList.toggle("hpd-arrival-summary-unlocked", summaryUnlocked);
      document.body.dataset.hpdArrivedJob = summaryUnlocked ? selectedId : "";

      if (priorJobCardOpenRef.current && !open && summaryUnlocked) {
        window.setTimeout(reopenAiJobSummary, 140);
      }
      priorJobCardOpenRef.current = open;
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "value"] });
    const timer = window.setInterval(sync, 650);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.body.classList.remove("hpd-full-job-open", "hpd-arrival-summary-unlocked");
      delete document.body.dataset.hpdArrivedJob;
    };
  }, []);

  const markArrived = () => {
    if (!trip) return;
    const arrived: ActiveTrip = {
      ...trip,
      status: "arrived",
      arrivedAt: new Date().toISOString(),
    };
    tripRef.current = arrived;
    setTrip(arrived);
    document.body.classList.add("hpd-arrival-summary-unlocked");
    window.dispatchEvent(new CustomEvent(ARRIVAL_EVENT, { detail: arrived }));
    window.setTimeout(() => openCompleteJobCard(arrived.id), 100);
  };

  const openDirections = () => {
    if (!trip) return;
    window.open(trip.directionsUrl, "_blank", "noopener,noreferrer");
  };

  const cancelTrip = () => {
    tripRef.current = null;
    setTrip(null);
    setDistance(null);
    setNearDestination(false);
    saveTrip(null);
    document.body.classList.remove("hpd-arrival-summary-unlocked");
    reopenAiChat();
  };

  const endVisit = () => {
    cancelTrip();
  };

  if (!portalHost || !trip) return null;

  const distanceLabel = distance === null
    ? "Distance updating"
    : distance < 0.1
      ? `${Math.round(distance * 5280)} ft away`
      : `${distance.toFixed(1)} mi away`;

  const bar = (
    <section className={`hpd-field-trip-bar ${trip.status} ${nearDestination ? "near" : ""} ${jobCardOpen ? "job-open" : ""}`} aria-label="Field visit status">
      <div className="hpd-field-trip-status">
        <span>{trip.status === "arrived" ? "Arrived" : nearDestination ? "Near destination" : "Enroute"}</span>
        <strong>{trip.id}</strong>
        <small>{trip.address}</small>
      </div>

      <div className="hpd-field-trip-distance">
        <b>{trip.status === "arrived" ? "On site" : distanceLabel}</b>
        <small>{trip.status === "arrived" ? "Full job card enabled" : nearDestination ? "Tap Arrived to open the complete job" : "AI dispatcher minimized while driving"}</small>
      </div>

      <div className="hpd-field-trip-actions">
        {trip.status === "enroute" ? (
          <>
            <button type="button" onClick={openDirections}>Directions</button>
            <button type="button" className="arrive" onClick={markArrived}>Arrived</button>
            <button type="button" className="quiet" onClick={cancelTrip}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="primary" onClick={() => openCompleteJobCard(trip.id)}>Open full job</button>
            <button type="button" onClick={reopenAiJobSummary}>AI summary</button>
            <button type="button" className="quiet" onClick={endVisit}>End visit</button>
          </>
        )}
      </div>
    </section>
  );

  return createPortal(bar, portalHost);
}
