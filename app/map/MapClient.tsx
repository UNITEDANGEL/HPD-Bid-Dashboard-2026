"use client";


import * as JobStatus from "../../lib/jobs/status";
import { useEffect, useMemo, useRef, useState } from "react";

type JobRecord = {
  id?: string;
  omo?: string;
  jobId?: string;
  address?: string;
  location?: string;
  borough?: string;
  status?: string;
  StatusOverride?: string;
  ITBMatchStatus?: string;
  COAParseStatus?: string;
  trade?: string;
  awardDate?: string;
  AwardDate?: string;
  dueDate?: string;
  bidDueDate?: string;
  bidAmount?: string;
  amountValue?: number;
  tenantPhone?: string;
  phone?: string;
  contractor?: string;
  owner?: string;
  description?: string;
  coaFile?: string;
  itbFile?: string;
  pdfFile?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
};

type MappedJob = JobRecord & {
  _lat?: number;
  _lng?: number;
  _source?: "stored" | "geocoded";
};

function asArray(value: unknown): JobRecord[] {
  if (Array.isArray(value)) return value as JobRecord[];

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) return obj.jobs as JobRecord[];
    if (Array.isArray(obj.data)) return obj.data as JobRecord[];
    if (Array.isArray(obj.records)) return obj.records as JobRecord[];
  }

  return [];
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStoredCoords(job: JobRecord) {
  const lat = toNumber(job.latitude ?? job.lat);
  const lng = toNumber(job.longitude ?? job.lng ?? job.lon);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function jobKey(job: JobRecord, index?: number) {
  return job.id || job.omo || job.jobId || `JOB-${index ?? ""}`;
}

function displayAddress(job: JobRecord) {
  return job.address || job.location || "No address listed";
}

function cleanAddress(job: JobRecord) {
  const raw = job.address || job.location || "";
  if (!raw.trim()) return "";

  const parts = [raw];

  if (job.borough && !raw.toLowerCase().includes(job.borough.toLowerCase())) {
    parts.push(job.borough);
  }

  if (!/ny|new york/i.test(raw)) {
    parts.push("New York");
  }

  return parts.filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

function cacheKey(job: JobRecord) {
  return `hpd_geo_${jobKey(job)}_${cleanAddress(job)}`.toLowerCase();
}

function money(job: JobRecord) {
  if (typeof job.amountValue === "number" && Number.isFinite(job.amountValue) && job.amountValue > 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(job.amountValue);
  }

  return job.bidAmount || "";
}

function phone(job: JobRecord) {
  return job.tenantPhone || job.phone || "";
}

function normalizedStatus(jobOrStatus?: JobRecord | string) {
  const raw =
    typeof jobOrStatus === "string"
      ? jobOrStatus
      : jobOrStatus?.StatusOverride ||
        jobOrStatus?.status ||
        jobOrStatus?.ITBMatchStatus ||
        jobOrStatus?.COAParseStatus ||
        "";

  return String(raw).toLowerCase().trim();
}

function statusLabel(job: JobRecord) {
  return (
    job.StatusOverride ||
    job.status ||
    job.ITBMatchStatus ||
    job.COAParseStatus ||
    "Pending"
  );
}

function statusKind(jobOrStatus?: JobRecord | string) {
  const value = normalizedStatus(jobOrStatus);

  if (value.includes("refused")) return "refused";
  if (value.includes("no access")) return "noaccess";
  if (value.includes("completed by other") || value.includes("completed by owner") || value.includes("landlord")) return "otherdone";
  if (value.includes("complete") || value.includes("work completed")) return "completed";
  if (value.includes("pending") || value.includes("active") || value.includes("loaded") || value.includes("matched") || value.includes("ok")) return "pending";

  return "unknown";
}

function statusClass(status?: string) {
  return `status-${statusKind(status)}`;
}

function markerColorForJob(job: JobRecord) {
  const kind = statusKind(job);

  if (kind === "completed") return "#53e69c";
  if (kind === "refused") return "#ff4d5f";
  if (kind === "noaccess") return "#47a3ff";
  if (kind === "otherdone") return "#b875ff";
  if (kind === "pending") return "#ffd166";

  return "#aebbd0";
}

function parseAwardDate(value?: string) {
  if (!value) return null;

  const clean = String(value).trim();
  const parts = clean.split(/[\/\-]/).map((part) => Number(part));

  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    let [month, day, year] = parts;
    if (year < 100) year += 2000;

    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(clean);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function maturityInfo(job: JobRecord, maturityDays = 30) {
  const award = parseAwardDate(job.AwardDate || job.awardDate);

  if (!award) {
    return {
      award: "Not listed",
      maturity: "Not listed",
      daysLeft: null as number | null,
      label: "No award date",
      priority: "nodate",
    };
  }

  const maturity = new Date(award);
  maturity.setDate(maturity.getDate() + maturityDays);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  maturity.setHours(0, 0, 0, 0);

  const daysLeft = Math.ceil((maturity.getTime() - today.getTime()) / 86400000);

  let label = "";
  let priority = "";

  if (daysLeft < 0) {
    label = `${Math.abs(daysLeft)} days overdue`;
    priority = "overdue";
  } else if (daysLeft === 0) {
    label = "Due today";
    priority = "urgent";
  } else if (daysLeft <= 3) {
    label = `${daysLeft} days left`;
    priority = "urgent";
  } else if (daysLeft <= 7) {
    label = `${daysLeft} days left`;
    priority = "warning";
  } else {
    label = `${daysLeft} days left`;
    priority = "normal";
  }

  return {
    award: award.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }),
    maturity: maturity.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }),
    daysLeft,
    label,
    priority,
  };
}

function maturityPriorityClass(job: JobRecord) {
  return `maturity-${maturityInfo(job).priority}`;
}

function maturityMapLabel(job: JobRecord) {
  const info = maturityInfo(job);

  if (info.daysLeft === null) return "?";

  if (info.daysLeft < 0) {
    return `${Math.abs(info.daysLeft)}`;
  }

  return `${info.daysLeft}`;
}

function overdueBucket(job: JobRecord) {
  const info = maturityInfo(job);

  if (info.daysLeft === null) return "nodate";
  if (info.daysLeft >= 0) return "notdue";

  const overdueDays = Math.abs(info.daysLeft);

  if (overdueDays <= 30) return "od0_30";
  if (overdueDays <= 60) return "od31_60";
  if (overdueDays <= 90) return "od61_90";
  return "od90plus";
}

function overdueDays(job: JobRecord) {
  const info = maturityInfo(job);
  if (info.daysLeft === null) return null;
  if (info.daysLeft >= 0) return 0;
  return Math.abs(info.daysLeft);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeJob(job: JobRecord) {
  const query = cleanAddress(job);
  if (!query) return null;

  const key = cacheKey(job);

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch {}

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
    encodeURIComponent(query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const first = Array.isArray(data) ? data[0] : null;

  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  try {
    localStorage.setItem(key, JSON.stringify({ lat, lng, query }));
  } catch {}

  return { lat, lng };
}

export default function MapClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [mappedJobs, setMappedJobs] = useState<MappedJob[]>([]);
  const [selected, setSelected] = useState<MappedJob | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading jobs...");
  const [mapReady, setMapReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [maturityFilter, setMaturityFilter] = useState<"all" | "od0_30" | "od31_60" | "od61_90" | "od90plus">("all");
  const [fullMap, setFullMap] = useState(false);

  const filteredJobs = useMemo<MappedJob[]>(() => {
    const needle = search.trim().toLowerCase();

    const rows: MappedJob[] = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords
            ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" }
            : { ...job };
        });

    const maturityFiltered =
      maturityFilter === "all"
        ? rows
        : rows.filter((job) => overdueBucket(job) === maturityFilter);

    if (!needle) return maturityFiltered;

    return maturityFiltered.filter((job) =>
      [
        job.id,
        job.omo,
        job.jobId,
        job.address,
        job.location,
        job.borough,
        job.trade,
        job.status,
        job.awardDate,
        job.bidDueDate,
        job.dueDate,
        job.bidAmount,
        job.tenantPhone,
        job.phone,
        job.contractor,
        job.owner,
        job.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [jobs, mappedJobs, search, maturityFilter]);

  const plottedCount = mappedJobs.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;

  const bucketCounts = useMemo(() => {
    const rows = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" } : { ...job };
        });

    return rows.reduce(
      (acc, job) => {
        const bucket = overdueBucket(job);
        acc.all += 1;
        if (bucket === "od0_30") acc.od0_30 += 1;
        if (bucket === "od31_60") acc.od31_60 += 1;
        if (bucket === "od61_90") acc.od61_90 += 1;
        if (bucket === "od90plus") acc.od90plus += 1;
        return acc;
      },
      { all: 0, od0_30: 0, od31_60: 0, od61_90: 0, od90plus: 0 }
    );
  }, [jobs, mappedJobs]);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) throw new Error(`/api/jobs returned ${response.status}`);

        const rows = asArray(await response.json());

        if (cancelled) return;

        setJobs(rows);

        const initialMapped: MappedJob[] = rows.map((job) => {
          const coords = getStoredCoords(job);
          if (!coords) return { ...job };
          return { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" };
        });

        setMappedJobs(initialMapped);

        const existing = initialMapped.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;
        const missing = rows.length - existing;

        setMessage(`${rows.length} jobs · ${existing} mapped · ${missing} need lookup`);

        const toGeocode = initialMapped
          .filter((job) => !Number.isFinite(job._lat) || !Number.isFinite(job._lng))
          .filter((job) => cleanAddress(job))
          .slice(0, 100);

        let geocoded = 0;

        for (const job of toGeocode) {
          if (cancelled) return;

          await wait(1050);

          const coords = await geocodeJob(job).catch(() => null);
          if (!coords) continue;

          geocoded += 1;

          setMappedJobs((current) =>
            current.map((item) => {
              const sameId = jobKey(item) === jobKey(job);
              const sameAddress = cleanAddress(item) === cleanAddress(job);

              if (sameId || sameAddress) {
                return {
                  ...item,
                  _lat: coords.lat,
                  _lng: coords.lng,
                  _source: "geocoded",
                };
              }

              return item;
            })
          );

          setMessage(`${rows.length} jobs · ${existing + geocoded} mapped · geocoding continues`);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setJobs([]);
          setMappedJobs([]);
          setMessage("Could not load /api/jobs. Showing NYC map only.");
        }
      }
    }

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapNode.current || mapRef.current) return;

      try {
        const L = await import("leaflet");

        if (cancelled || !mapNode.current) return;

        const map = L.map(mapNode.current, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        }).setView([40.7128, -74.006], 10);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const markerLayer = L.layerGroup().addTo(map);

        mapRef.current = map;
        markerLayerRef.current = markerLayer;

        setMapReady(true);

        setTimeout(() => map.invalidateSize(), 250);
        setTimeout(() => map.invalidateSize(), 1000);
      } catch (error) {
        console.error(error);
        if (!cancelled) setMessage("Map failed to initialize.");
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function drawMarkers() {
      if (!mapReady || !mapRef.current || !markerLayerRef.current) return;

      const L = await import("leaflet");
      const map = mapRef.current;
      const layer = markerLayerRef.current;

      layer.clearLayers();

      const bounds: [number, number][] = [];

      filteredJobs.forEach((job, index) => {
        if (!Number.isFinite(job._lat) || !Number.isFinite(job._lng)) return;

        const lat = Number(job._lat);
        const lng = Number(job._lng);

        const color = (job.status || "").toLowerCase().includes("award")
          ? "#53e69c"
          : job._source === "geocoded"
            ? "#ffd166"
            : "#42e8f3";

        const info = maturityInfo(job);
        const markerColor = JobStatus.statusColor(job);

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "maturity-map-marker",
            html: `<div class="maturity-marker-bubble maturity-${info.priority} ${JobStatus.statusMarkerClass(job)}" style="border-color:${markerColor}">
                    <strong>${maturityMapLabel(job)}</strong>
                  </div>`,
            iconSize: [46, 34],
            iconAnchor: [23, 17],
            popupAnchor: [0, -18],
          }),
        });

        marker.on("click", () => {
          setSelected(job);
          setDrawerOpen(true);
        });

        marker.bindPopup(`
          <div style="min-width:210px">
            <strong>${jobKey(job, index)}</strong><br/>
            ${displayAddress(job)}<br/>
            ${job.borough || ""} ${job.trade ? "· " + job.trade : ""}<br/>
            ${JobStatus.statusLabel(job)} ${money(job) ? "· " + money(job) : ""}<br/>Award: ${maturityInfo(job).award}<br/>Matures: ${maturityInfo(job).maturity}<br/>Overdue: ${overdueDays(job) ?? "?"} days
          </div>
        `);

        marker.addTo(layer);
        bounds.push([lat, lng]);
      });

      if (bounds.length) {
        map.fitBounds(bounds, {
          padding: [34, 34],
          maxZoom: 15,
        });
      } else {
        map.setView([40.7128, -74.006], 10);
      }

      setTimeout(() => map.invalidateSize(), 250);
    }

    drawMarkers();
  }, [mapReady, filteredJobs]);

  function focusJob(job: MappedJob) {
    setSelected(job);
    setDrawerOpen(true);

    if (Number.isFinite(job._lat) && Number.isFinite(job._lng) && mapRef.current) {
      mapRef.current.setView([Number(job._lat), Number(job._lng)], 16);
    }
  }

  function directionsUrl(job: JobRecord) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress(job))}`;
  }

  return (
    <main className={`map-shell ${fullMap ? "full-map-mode" : ""}`}>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .maturity-map-marker {
          background: transparent;
          border: 0;
        }

        .maturity-marker-bubble {
          min-width: 44px;
          min-height: 34px;
          padding: 4px 7px;
          display: grid;
          place-items: center;
          border: 3px solid #42e8f3;
          border-radius: 999px;
          background: rgba(7, 17, 31, 0.94);
          color: #f8fbff;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(8px);
        }

        .maturity-marker-bubble strong {
          font-size: 13px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -0.04em;
        }

        .maturity-marker-bubble.status-marker-completed {
          box-shadow: 0 0 0 4px rgba(83, 230, 156, 0.22), 0 0 28px rgba(83, 230, 156, 0.8), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-refused {
          box-shadow: 0 0 0 4px rgba(255, 77, 95, 0.24), 0 0 30px rgba(255, 77, 95, 0.82), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-noaccess1 {
          box-shadow: 0 0 0 4px rgba(127, 147, 170, 0.25), 0 0 24px rgba(127, 147, 170, 0.72), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-noaccess2 {
          box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.55), 0 0 30px rgba(0, 0, 0, 0.92), 0 12px 30px rgba(0,0,0,.5);
        }

        .maturity-marker-bubble.status-marker-otherdone {
          box-shadow: 0 0 0 4px rgba(184, 117, 255, 0.25), 0 0 28px rgba(184, 117, 255, 0.8), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-pending {
          box-shadow: 0 0 0 4px rgba(255, 209, 102, 0.2), 0 0 24px rgba(255, 209, 102, 0.65), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-none {
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
        }

        .maturity-marker-bubble.maturity-overdue {
          background: rgba(80, 8, 16, 0.95);
          color: #ffe4e8;
        }

        .maturity-marker-bubble.maturity-urgent {
          background: rgba(76, 35, 11, 0.95);
          color: #ffe2cf;
        }

        .maturity-marker-bubble.maturity-warning {
          background: rgba(73, 55, 8, 0.95);
          color: #fff0b8;
        }

        .maturity-marker-bubble.maturity-normal {
          background: rgba(7, 17, 31, 0.94);
          color: #e8fbff;
        }

        .maturity-marker-bubble.maturity-nodate {
          background: rgba(40, 46, 58, 0.95);
          color: #d7e4f8;
        }

        .leaflet-container {
          width: 100%;
          height: 100%;
          min-height: 100%;
          background: #0d1826;
          color: #111827;
          z-index: 1;
        }

        .map-shell {
          height: 100dvh;
          width: 100%;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          background: #07111f;
          overflow: hidden;
        }

        .map-top {
          z-index: 5;
          padding: max(7px, env(safe-area-inset-top)) 10px 7px;
          display: grid;
          gap: 8px;
          background: rgba(7, 17, 31, 0.95);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
        }

        .map-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .map-title-row h1 {
          margin: 0;
          font-size: clamp(19px, 5.4vw, 30px);
          letter-spacing: -0.06em;
          line-height: 1;
        }

        .map-title-row p {
          margin: 3px 0 0;
          color: #aebbd0;
          font-size: 11px;
          line-height: 1.25;
        }

        .home-btn {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 9px 11px;
          font-weight: 950;
          font-size: 12px;
        }

        .map-search {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .map-search input {
          width: 100%;
          min-height: 38px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          padding: 0 12px;
          font-size: 16px;
          outline: none;
        }

        .jobs-toggle {
          min-height: 38px;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          padding: 0 13px;
        }

        .map-filter-row {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 6px;
        }

        .map-filter-row button {
          min-height: 34px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #d7e4f8;
          font-size: 11px;
          font-weight: 950;
          padding: 0 8px;
        }

        .map-filter-row button.active {
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          border-color: transparent;
        }

        .map-filter-row .full-btn {
          background: rgba(83, 230, 156, 0.15);
          color: #caffdf;
          border-color: rgba(83, 230, 156, 0.34);
        }

        .map-shell.full-map-mode {
          grid-template-rows: auto minmax(0, 1fr);
        }

        .map-shell.full-map-mode .job-drawer {
          display: none;
        }

        .map-shell.full-map-mode .map-top {
          padding-bottom: 8px;
        }

        .map-shell.full-map-mode .map-stage {
          min-height: 0;
        }

        .map-stage {
          position: relative;
          height: 100%;
          min-height: 0;
          width: 100%;
        }

        .map-node {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .map-stats {
          position: absolute;
          z-index: 4;
          left: 10px;
          right: 10px;
          top: 10px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          pointer-events: none;
        }

        .map-stat {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(7, 17, 31, 0.82);
          backdrop-filter: blur(12px);
          border-radius: 15px;
          padding: 9px;
        }

        .map-stat strong {
          display: block;
          font-size: 17px;
          line-height: 1;
        }

        .map-stat span {
          display: block;
          margin-top: 4px;
          color: #aebbd0;
          font-size: 10px;
          font-weight: 900;
        }

        .zoom-panel {
          position: absolute;
          z-index: 5;
          right: 12px;
          bottom: 12px;
          display: grid;
          gap: 8px;
        }

        .zoom-panel button {
          width: 48px;
          min-height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 15px;
          background: rgba(7, 17, 31, 0.9);
          color: #f8fbff;
          font-size: 20px;
          font-weight: 950;
          box-shadow: 0 12px 34px rgba(0,0,0,.32);
        }

        .job-drawer {
          z-index: 6;
          max-height: 42dvh;
          background: rgba(7, 17, 31, 0.98);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 22px 22px 0 0;
          padding: 12px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          overflow: auto;
          box-shadow: 0 -20px 70px rgba(0, 0, 0, 0.42);
        }

        .job-drawer.closed {
          max-height: 62px;
          overflow: hidden;
        }

        .drawer-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .drawer-head strong {
          font-size: 20px;
        }

        .drawer-head button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 950;
        }

        .job-status-card {
          position: relative;
          overflow: hidden;
          border-left-width: 7px !important;
        }

        .status-card-completed {
          border-left-color: #53e69c !important;
          background: linear-gradient(135deg, rgba(83, 230, 156, 0.14), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-refused {
          border-left-color: #ff4d5f !important;
          background: linear-gradient(135deg, rgba(255, 77, 95, 0.16), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-noaccess {
          border-left-color: #47a3ff !important;
          background: linear-gradient(135deg, rgba(71, 163, 255, 0.16), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-otherdone {
          border-left-color: #b875ff !important;
          background: linear-gradient(135deg, rgba(184, 117, 255, 0.16), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-pending {
          border-left-color: #ffd166 !important;
          background: linear-gradient(135deg, rgba(255, 209, 102, 0.14), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-unknown {
          border-left-color: #aebbd0 !important;
        }

        .selected-card,
        .job-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 22px; padding: 17px;
          margin-bottom: 10px;
        }

        .selected-card {
          background: linear-gradient(145deg, rgba(66, 232, 243, 0.16), rgba(71, 163, 255, 0.1));
          border-color: rgba(66, 232, 243, 0.38);
        }

        .job-main-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .job-title {
          display: block;
          font-size: 20px;
          letter-spacing: -0.035em;
        }

        .job-address {
          margin: 7px 0 0;
          color: #f8fbff;
          font-size: 15px;
          line-height: 1.35;
        }

        .job-sub {
          margin: 5px 0 0;
          color: #aebbd0;
          font-size: 13px;
          line-height: 1.35;
        }

        .status {
          flex: 0 0 auto;
          max-width: 110px;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status.status-completed {
          background: rgba(83, 230, 156, 0.16);
          color: #baffd8;
        }

        .status.status-refused {
          background: rgba(255, 77, 95, 0.18);
          color: #ffc7ce;
        }

        .status.status-noaccess {
          background: rgba(71, 163, 255, 0.18);
          color: #d6ebff;
        }

        .status.status-otherdone {
          background: rgba(184, 117, 255, 0.18);
          color: #efdfff;
        }

        .status.status-pending {
          background: rgba(255, 209, 102, 0.16);
          color: #ffe7a3;
        }

        .status.status-unknown {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .status.good {
          background: rgba(83, 230, 156, 0.16);
          color: #baffd8;
        }

        .status.hot {
          background: rgba(66, 232, 243, 0.14);
          color: #c4fbff;
        }

        .status.warn {
          background: rgba(255, 209, 102, 0.14);
          color: #ffe7a3;
        }

        .status.neutral {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .maturity-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 7px 9px;
          font-size: 11px;
          font-weight: 1000;
          white-space: nowrap;
        }

        .maturity-normal {
          background: rgba(83, 230, 156, 0.15);
          color: #baffd8;
        }

        .maturity-warning {
          background: rgba(255, 209, 102, 0.16);
          color: #ffe7a3;
        }

        .maturity-urgent {
          background: rgba(255, 138, 76, 0.18);
          color: #ffd0ba;
        }

        .maturity-overdue {
          background: rgba(255, 107, 122, 0.18);
          color: #ffc2cb;
        }

        .maturity-nodate {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .detail {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.065);
          border-radius: 13px;
          padding: 10px;
          min-width: 0;
        }

        .detail span {
          display: block;
          color: #aebbd0;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .detail strong {
          display: block;
          margin-top: 4px;
          color: #f8fbff;
          font-size: 13px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .card-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .card-actions a,
        .card-actions button {
          min-height: 40px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          font-size: 12px;
          text-align: center;
        }

        .card-actions .secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fbff;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .job-card-button {
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 0;
          text-align: left;
        }

        @media (min-width: 920px) {
          .map-shell {
            grid-template-columns: 430px minmax(0, 1fr);
            grid-template-rows: auto minmax(0, 1fr);
          }

          .map-top {
            grid-column: 1 / -1;
          }

          .zoom-panel {
          position: absolute;
          z-index: 5;
          right: 12px;
          bottom: 12px;
          display: grid;
          gap: 8px;
        }

        .zoom-panel button {
          width: 48px;
          min-height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 15px;
          background: rgba(7, 17, 31, 0.9);
          color: #f8fbff;
          font-size: 20px;
          font-weight: 950;
          box-shadow: 0 12px 34px rgba(0,0,0,.32);
        }

        .job-drawer {
            grid-column: 1;
            grid-row: 2;
            height: 100%;
            max-height: none;
            border-radius: 0;
            border-top: 0;
            border-right: 1px solid rgba(255, 255, 255, 0.14);
          }

          .job-drawer.closed {
            max-height: none;
          }

          .map-filter-row {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 6px;
        }

        .map-filter-row button {
          min-height: 34px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #d7e4f8;
          font-size: 11px;
          font-weight: 950;
          padding: 0 8px;
        }

        .map-filter-row button.active {
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          border-color: transparent;
        }

        .map-filter-row .full-btn {
          background: rgba(83, 230, 156, 0.15);
          color: #caffdf;
          border-color: rgba(83, 230, 156, 0.34);
        }

        .map-shell.full-map-mode {
          grid-template-rows: auto minmax(0, 1fr);
        }

        .map-shell.full-map-mode .job-drawer {
          display: none;
        }

        .map-shell.full-map-mode .map-top {
          padding-bottom: 8px;
        }

        .map-shell.full-map-mode .map-stage {
          min-height: 0;
        }

        .map-stage {
            grid-column: 2;
            grid-row: 2;
          }
        }

        @media (max-width: 520px) {
          .map-stats {
            grid-template-columns: repeat(3, 1fr);
          }

          .maturity-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 7px 9px;
          font-size: 11px;
          font-weight: 1000;
          white-space: nowrap;
        }

        .maturity-normal {
          background: rgba(83, 230, 156, 0.15);
          color: #baffd8;
        }

        .maturity-warning {
          background: rgba(255, 209, 102, 0.16);
          color: #ffe7a3;
        }

        .maturity-urgent {
          background: rgba(255, 138, 76, 0.18);
          color: #ffd0ba;
        }

        .maturity-overdue {
          background: rgba(255, 107, 122, 0.18);
          color: #ffc2cb;
        }

        .maturity-nodate {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .detail-grid {
            grid-template-columns: 1fr;
          }

          .card-actions {
            grid-template-columns: 1fr;
          }

          .zoom-panel {
          position: absolute;
          z-index: 5;
          right: 12px;
          bottom: 12px;
          display: grid;
          gap: 8px;
        }

        .zoom-panel button {
          width: 48px;
          min-height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 15px;
          background: rgba(7, 17, 31, 0.9);
          color: #f8fbff;
          font-size: 20px;
          font-weight: 950;
          box-shadow: 0 12px 34px rgba(0,0,0,.32);
        }

        .job-drawer {
            max-height: 44dvh;
          }
        }
      `}</style>

      <header className="map-top">
        <div className="map-title-row">
          <div>
            <h1>All Jobs Map</h1>
            <p>{message}</p>
          </div>
          <a className="home-btn" href="/">Home</a>
        </div>

        <div className="map-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search OMO, address, borough, trade..."
          />
          <button className="jobs-toggle" type="button" onClick={() => setDrawerOpen((value) => !value)}>
            Jobs
          </button>
        </div>

        <div className="map-filter-row">
          <button className={maturityFilter === "all" ? "active" : ""} type="button" onClick={() => setMaturityFilter("all")}>All {bucketCounts.all}</button>
          <button className={maturityFilter === "od0_30" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od0_30")}>0-30 OD {bucketCounts.od0_30}</button>
          <button className={maturityFilter === "od31_60" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od31_60")}>31-60 OD {bucketCounts.od31_60}</button>
          <button className={maturityFilter === "od61_90" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od61_90")}>61-90 OD {bucketCounts.od61_90}</button>
          <button className={maturityFilter === "od90plus" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od90plus")}>90+ OD {bucketCounts.od90plus}</button>
          <button className="full-btn" type="button" onClick={() => {
            setFullMap((value) => !value);
            setTimeout(() => mapRef.current?.invalidateSize(), 250);
            setTimeout(() => mapRef.current?.invalidateSize(), 700);
          }}>
            {fullMap ? "Exit Full" : "Full Map"}
          </button>
        </div>
      </header>

      <section className="map-stage">
        <div ref={mapNode} className="map-node" />

        <div className="map-stats">
          <div className="map-stat">
            <strong>{jobs.length}</strong>
            <span>Total</span>
          </div>
          <div className="map-stat">
            <strong>{plottedCount}</strong>
            <span>Mapped</span>
          </div>
          <div className="map-stat">
            <strong>{Math.max(0, jobs.length - plottedCount)}</strong>
            <span>Need geo</span>
          </div>
        </div>

        <div className="zoom-panel">
          <button type="button" onClick={() => mapRef.current?.zoomIn()}>+</button>
          <button type="button" onClick={() => mapRef.current?.zoomOut()}>−</button>
          <button type="button" onClick={() => {
            const mapped = filteredJobs.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng));
            if (mapped.length && mapRef.current) {
              const bounds = mapped.map((job) => [Number(job._lat), Number(job._lng)]);
              mapRef.current.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
            }
          }}>Fit</button>
        </div>
      </section>

      <aside className={`job-drawer ${drawerOpen ? "" : "closed"}`}>
        <div className="drawer-head">
          <strong>{filteredJobs.length} jobs</strong>
          <button type="button" onClick={() => setDrawerOpen((value) => !value)}>
            {drawerOpen ? "Hide Cards" : "Show Cards"}
          </button>
        </div>

        {selected ? (
          <div className={`selected-card job-status-card ${JobStatus.statusCardClass(selected)}`}>
            <div className="job-main-row">
              <div>
                <strong className="job-title">{jobKey(selected)}</strong>
                <p className="job-address">{displayAddress(selected)}</p>
                <p className="job-sub">{selected.borough || "Unknown borough"} · {selected.trade || "Trade not listed"}</p>
              </div>
              <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <span className={`status ${statusClass(selected.status)}`}>{JobStatus.statusLabel(selected)}</span>
                <span className={`maturity-pill ${maturityPriorityClass(selected)}`}>{maturityInfo(selected).label}</span>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail"><span>Amount</span><strong>{money(selected) || "Not listed"}</strong></div>
              <div className="detail"><span>Award Date</span><strong>{maturityInfo(selected).award}</strong></div>
              <div className="detail"><span>Maturity Date</span><strong>{maturityInfo(selected).maturity}</strong></div>
              <div className="detail"><span>Maturity Counter</span><strong>{maturityInfo(selected).label}</strong></div>
              <div className="detail"><span>Due Date</span><strong>{selected.bidDueDate || selected.dueDate || "Not listed"}</strong></div>
              <div className="detail"><span>Phone</span><strong>{phone(selected) || "Not listed"}</strong></div>
              <div className="detail"><span>Contractor</span><strong>{selected.contractor || "Not listed"}</strong></div>
              <div className="detail"><span>Owner</span><strong>{selected.owner || "Not listed"}</strong></div>
              <div className="detail"><span>Docs</span><strong>{[selected.coaFile ? "COA ✓" : "", selected.itbFile ? "ITB ✓" : "", selected.pdfFile ? "PDF ✓" : ""].filter(Boolean).join(" ") || "Not listed"}</strong></div>
              <div className="detail"><span>Map Source</span><strong>{selected._source || "unmapped"}</strong></div>
            </div>

            {selected.description ? <p className="job-sub">{selected.description}</p> : null}

            <div className="card-actions">
              <button type="button" className="secondary" onClick={() => setDrawerOpen(true)}>Details</button>
              <a href={`/invoice-generator?job=${encodeURIComponent(jobKey(selected))}`}>Invoice</a>
              <a target="_blank" rel="noreferrer" href={directionsUrl(selected)}>Directions</a>
            </div>
          </div>
        ) : null}

        {filteredJobs.slice(0, 300).map((job, index) => (
          <div className={`job-card job-status-card ${JobStatus.statusCardClass(job)}`} key={`${jobKey(job, index)}-${index}`}>
            <button className="job-card-button" type="button" onClick={() => focusJob(job)}>
              <div className="job-main-row">
                <div>
                  <strong className="job-title">{jobKey(job, index)}</strong>
                  <p className="job-address">{displayAddress(job)}</p>
                  <p className="job-sub">{job.borough || "Unknown borough"} · {job.trade || "Trade not listed"}</p>
                </div>
                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span className={`status ${statusClass(job.status)}`}>{JobStatus.statusLabel(job)}</span>
                  <span className={`maturity-pill ${maturityPriorityClass(job)}`}>{maturityInfo(job).label}</span>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail"><span>Amount</span><strong>{money(job) || "Not listed"}</strong></div>
                <div className="detail"><span>Award</span><strong>{job.awardDate || "Not listed"}</strong></div>
                <div className="detail"><span>Due</span><strong>{job.bidDueDate || job.dueDate || "Not listed"}</strong></div>
                <div className="detail"><span>Docs</span><strong>{[job.coaFile ? "COA ✓" : "", job.itbFile ? "ITB ✓" : "", job.pdfFile ? "PDF ✓" : ""].filter(Boolean).join(" ") || "Not listed"}</strong></div>
              </div>
            </button>

            <div className="card-actions">
              <button className="secondary" type="button" onClick={() => focusJob(job)}>Details</button>
              <a className="secondary" href={`/invoice-generator?job=${encodeURIComponent(jobKey(job, index))}`}>Invoice</a>
              <a target="_blank" rel="noreferrer" href={directionsUrl(job)}>Directions</a>
            </div>
          </div>
        ))}
      </aside>
    </main>
  );
}


















