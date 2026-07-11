"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect } from "react";

type JobRecord = Record<string, unknown>;

type IndexedJob = {
  id: string;
  address: string;
  lat?: number;
  lng?: number;
};

const ACTIVE_TRIP_STORAGE_KEY = "hpd-ai-active-trip-v1";
const ENROUTE_EVENT = "hpd-map-enroute";

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

const JOB_INDEX = new Map<string, IndexedJob>();

for (const rawJob of bundledJobsData as JobRecord[]) {
  const id = firstValue(rawJob, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  if (!id) continue;

  const lat = Number(rawJob.Latitude ?? rawJob.latitude ?? rawJob.lat);
  const lng = Number(rawJob.Longitude ?? rawJob.longitude ?? rawJob.lng ?? rawJob.lon);

  JOB_INDEX.set(id, {
    id,
    address: firstValue(rawJob, ["BuildingAddress", "Building_Address", "Address", "address", "location"]),
    lat: Number.isFinite(lat) && lat !== 0 ? lat : undefined,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : undefined,
  });
}

function cleanRouteDetail(detail: string) {
  const pieces = detail.split("·").map((piece) => piece.trim()).filter(Boolean);
  return pieces.length > 1 ? pieces[pieces.length - 1] : detail.trim();
}

function directionsUrl(id: string, fallbackAddress: string) {
  const job = JOB_INDEX.get(id.toUpperCase());
  const destination = job?.lat && job?.lng
    ? `${job.lat},${job.lng}`
    : job?.address || cleanRouteDetail(fallbackAddress);

  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination,
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function beginTrip(id: string, fallbackAddress: string, url: string) {
  const job = JOB_INDEX.get(id.toUpperCase());
  const detail = {
    id: id.toUpperCase(),
    address: job?.address || cleanRouteDetail(fallbackAddress),
    lat: job?.lat,
    lng: job?.lng,
    directionsUrl: url,
    status: "enroute" as const,
    enrouteAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // The trip still works for this session through the custom event.
  }

  window.dispatchEvent(new CustomEvent(ENROUTE_EVENT, { detail }));
}

function makeEnrouteButton(id: string, fallbackAddress: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hpd-ai-enroute";
  button.dataset.enrouteFor = id;
  button.setAttribute("aria-label", `Driving directions to ${id || fallbackAddress}`);
  button.title = `Driving directions to ${id || fallbackAddress}`;
  button.innerHTML = "<span>↗</span><b>Enroute</b>";

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const url = directionsUrl(id, fallbackAddress);
    beginTrip(id, fallbackAddress, url);
    button.classList.add("opening");
    const label = button.querySelector("b");
    if (label) label.textContent = "Opening";
    window.open(url, "_blank", "noopener,noreferrer");

    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("opening");
      const currentLabel = button.querySelector("b");
      if (currentLabel) currentLabel.textContent = "Enroute";
    }, 1200);
  });

  return button;
}

function enhanceResultList() {
  const list = document.querySelector<HTMLElement>(".hpd-ai-result-list");
  if (!list) return;

  const mainButtons = Array.from(list.querySelectorAll<HTMLButtonElement>(":scope > button:not(.hpd-ai-enroute)"));
  for (const mainButton of mainButtons) {
    const id = String(mainButton.querySelector("span strong")?.textContent || "").trim().toUpperCase();
    const address = String(mainButton.querySelector("span small")?.textContent || "").trim();
    if (!id && !address) continue;

    mainButton.classList.add("hpd-ai-list-main");
    const sibling = mainButton.nextElementSibling;
    if (
      sibling instanceof HTMLButtonElement &&
      sibling.classList.contains("hpd-ai-enroute") &&
      sibling.dataset.enrouteFor === id
    ) {
      continue;
    }

    if (sibling instanceof HTMLButtonElement && sibling.classList.contains("hpd-ai-enroute")) {
      sibling.remove();
    }
    mainButton.insertAdjacentElement("afterend", makeEnrouteButton(id, address));
  }
}

function enhanceRouteList() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".hpd-ai-route-list > li"));
  for (const row of rows) {
    const mainButton = row.querySelector<HTMLButtonElement>(":scope > button:not(.hpd-ai-enroute)");
    if (!mainButton) continue;

    const id = String(mainButton.querySelector("span strong")?.textContent || "").trim().toUpperCase();
    const detail = String(mainButton.querySelector("span small")?.textContent || "").trim();
    if (!id && !detail) continue;

    mainButton.classList.add("hpd-ai-list-main");
    const existing = row.querySelector<HTMLButtonElement>(":scope > .hpd-ai-enroute");
    if (existing?.dataset.enrouteFor === id) continue;
    existing?.remove();
    row.appendChild(makeEnrouteButton(id, detail));
  }
}

export default function MapDirectionsEnhancer() {
  useEffect(() => {
    const enhance = () => {
      enhanceResultList();
      enhanceRouteList();
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(enhance, 900);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
