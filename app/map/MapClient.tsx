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
const [selectedOnly, setSelectedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading jobs...");
  const [mapReady, setMapReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
const [hideCompleted, setHideCompleted] = useState(false);

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
          setSelectedOnly(true);
          setDrawerOpen(true);

          setTimeout(() => {
            mapRef.current?.panTo([Number(job._lat), Number(job._lng)], {
              animate: true,
              duration: 0.55,
            });
          }, 40);

          setTimeout(() => {
            document.querySelector(".selected-card")?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }, 160);
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

  function updateStatus(job: any, newStatus: string) {
  if (!job?.OMO) return;

  fetch("/api/update-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      omo: job.OMO,
      status: newStatus
    })
  })
    .then(() => {
      // update UI immediately
      job.StatusOverride = newStatus;
      job.status = newStatus;
      setSelected({ ...job });
    })
    .catch(() => alert("Failed to update status"));
}

function updateLocalStatus(job: MappedJob, nextStatus: string) {
    const updated = {
      ...job,
      StatusOverride: nextStatus,
      status: nextStatus || "Pending",
      ITBMatchStatus: nextStatus || job.ITBMatchStatus,
    };

    setSelected(updated);

    setMappedJobs((rows) =>
      rows.map((row) => jobKey(row) === jobKey(job) ? { ...row, ...updated } : row)
    );

    setJobs((rows) =>
      rows.map((row) => jobKey(row) === jobKey(job) ? { ...row, ...updated } : row)
    );
  }

function generateAffidavit(job: any, type: string) {
    fetch("/api/affidavit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job, type }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.url) {
          window.open(data.url, "_blank");
        } else {
          alert("Failed to generate affidavit");
        }
      })
      .catch(() => alert("Failed to generate affidavit"));
  }

async function openRealFullMap() {
    const el = document.querySelector(".map-stage") as HTMLElement | null;

    try {
      if (!document.fullscreenElement && el?.requestFullscreen) {
        await el.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen errors
    }

    setTimeout(() => mapRef.current?.invalidateSize(), 150);
    setTimeout(() => mapRef.current?.invalidateSize(), 500);
  }

function focusJob(job: MappedJob) {
    setSelected(job);
          setSelectedOnly(true);
          setDrawerOpen(true);

    if (Number.isFinite(job._lat) && Number.isFinite(job._lng) && mapRef.current) {
      mapRef.current.flyTo([Number(job._lat), Number(job._lng)], 16, {
        animate: true,
        duration: 0.65,
      });
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
            grid-template-rows: auto minmax(0, 1fr);
            background: #07111f;
            overflow: hidden;
          }

        .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
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
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 2px;
            -webkit-overflow-scrolling: touch;
          }

        .map-filter-row button { flex: 0 0 auto; flex: 0 0 auto;
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

        .map-shell.full-map-mode .status-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.status-actions button {
  padding: 8px;
  font-size: 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: rgba(255,255,255,0.08);
  color: #fff;
}

.status-actions button:hover {
  background: rgba(255,255,255,0.18);
}

.job-drawer {
          display: block;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          max-height: 38dvh;
          overflow-y: auto;
          position: relative;
          z-index: 20;
          }

        .map-shell.full-map-mode .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          padding-bottom: 8px;
        }

        .map-shell.full-map-mode .map-stage:fullscreen {
          width: 100vw;
          height: 100vh;
          background: #050914;
        }

        .map-stage:fullscreen .leaflet-container {
          height: 100vh !important;
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
            right: 78px;
            top: 10px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 7px;
            pointer-events: none;
          }

        .map-stat {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(7, 17, 31, 0.82);
          backdrop-filter: blur(12px);
          border-radius: 18px;
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

        .status-legend {
          position: absolute;
          z-index: 6;
          left: 12px;
          bottom: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-width: calc(100% - 82px);
          padding: 7px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 999px;
          background: rgba(7,17,31,.84);
          backdrop-filter: blur(14px);
          box-shadow: 0 14px 42px rgba(0,0,0,.36);
        }

        .status-legend span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #e9f3ff;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
        }

        .dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 12px currentColor;
        }

        .dot.completed { background: #53e69c; color: #53e69c; }
        .dot.refused { background: #ff4d5f; color: #ff4d5f; }
        .dot.noaccess { background: #47a3ff; color: #47a3ff; }
        .dot.second { background: #05070b; color: #ffffff; border: 1px solid #fff; }
        .dot.pending { background: #ffd166; color: #ffd166; }

        .map-shell.full-map-mode {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          z-index: 99999 !important;
          background: #050914 !important;
          display: grid !important;
          grid-template-rows: auto 1fr !important;
          grid-template-columns: 1fr !important;
          padding: 0 !important;
          overflow: hidden !important;
        }

        .map-shell.full-map-mode .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          grid-row: 1 !important;
          grid-column: 1 !important;
          border-radius: 0 !important;
          padding: max(8px, env(safe-area-inset-top)) 10px 8px !important;
        }

        .map-shell.full-map-mode .map-stage {
            position: relative;
            height: 100%;
            min-height: 0;
            width: 100%;
          }

        .job-drawer.closed {
            max-height: 64px;
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

        .status-actions {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin: 12px 0;
        }

        .status-actions button {
          min-height: 38px;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
          color: #f8fbff;
          font-size: 12px;
          font-weight: 900;
        }

        .status-actions button:nth-child(1) {
          border-color: rgba(127,147,170,.45);
        }

        .status-actions button:nth-child(2) {
          border-color: rgba(0,0,0,.75);
        }

        .status-actions button:nth-child(3) {
          border-color: rgba(255,77,95,.6);
        }

        .status-actions button:nth-child(4) {
          border-color: rgba(83,230,156,.6);
        }

        .status-actions button:nth-child(5) {
          border-color: rgba(184,117,255,.6);
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
              grid-template-columns: 1fr;
              grid-template-rows: auto minmax(0, 1fr);
            }
            .map-top {
              grid-column: 1;
            }
            .map-stage {
              grid-column: 1;
              grid-row: 2;
            }
            .job-drawer {
              left: 50%;
              right: auto;
              width: min(760px, calc(100vw - 24px));
              transform: translateX(-50%);
            }
          }
        .map-shell.full-map-mode {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          z-index: 99999 !important;
          background: #050914 !important;
          display: grid !important;
          grid-template-rows: auto 1fr !important;
          grid-template-columns: 1fr !important;
          padding: 0 !important;
          overflow: hidden !important;
        }

        .map-shell.full-map-mode .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          grid-row: 1 !important;
          grid-column: 1 !important;
          border-radius: 0 !important;
          padding: max(8px, env(safe-area-inset-top)) 10px 8px !important;
        }

        .map-shell.full-map-mode .map-stage {
          grid-row: 2 !important;
          grid-column: 1 !important;
          height: 100% !important;
          min-height: 0 !important;
          border-radius: 0 !important;
        }

        .map-shell.full-map-mode .leaflet-container,
        .map-shell.full-map-mode #map {
          height: 100% !important;
          min-height: 100% !important;
        }

        .map-shell.full-map-mode .job-drawer {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          z-index: 100000 !important;
          max-height: 46dvh !important;
          display: block !important;
        }

        .map-shell.full-map-mode .job-drawer.closed {
            max-height: 64px;
            overflow: hidden;
          }
          @media (max-width: 700px) {
            .map-shell {
              grid-template-rows: auto minmax(0, 1fr) !important;
            }

            .map-top {
              padding: max(5px, env(safe-area-inset-top)) 7px 5px !important;
              gap: 5px !important;
            }

            .map-title-row h1 {
              font-size: 18px !important;
            }

            .map-title-row p {
              font-size: 10px !important;
              max-height: 14px;
              overflow: hidden;
            }

            .map-search input {
              min-height: 34px !important;
              font-size: 14px !important;
            }

            .jobs-toggle {
              min-height: 34px !important;
              padding: 0 10px !important;
            }

            .map-filter-row,
            .status-filter-bar {
              gap: 5px !important;
              padding-bottom: 1px !important;
            }

            .map-filter-row button,
            .status-filter-bar button {
              min-height: 30px !important;
              font-size: 10px !important;
              padding: 0 8px !important;
            }

            .map-stats {
              top: 7px !important;
              left: 7px !important;
              right: 68px !important;
              gap: 5px !important;
            }

            .map-stat {
              padding: 6px !important;
              border-radius: 13px !important;
              backdrop-filter: none !important;
              background: rgba(7, 17, 31, 0.72) !important;
            }

            .map-stat strong {
              font-size: 14px !important;
            }

            .map-stat span {
              font-size: 8px !important;
            }

            .status-legend {
              left: 7px !important;
              bottom: 7px !important;
              max-width: calc(100% - 74px) !important;
              padding: 5px !important;
              gap: 5px !important;
              backdrop-filter: none !important;
              border-radius: 14px !important;
            }

            .status-legend span {
              font-size: 9px !important;
            }

            .zoom-panel {
              right: 7px !important;
              bottom: 7px !important;
              gap: 6px !important;
            }

            .zoom-panel button {
              width: 46px !important;
              min-height: 42px !important;
              border-radius: 15px !important;
              font-size: 16px !important;
            }

            .job-drawer {
              left: 6px !important;
              right: 6px !important;
              bottom: 6px !important;
              max-height: 38dvh !important;
              padding: 9px !important;
              border-radius: 20px !important;
              backdrop-filter: none !important;
              box-shadow: 0 -10px 34px rgba(0,0,0,.48) !important;
              -webkit-overflow-scrolling: touch;
            }

            .job-drawer.closed {
              max-height: 52px !important;
            }

            .drawer-head {
              margin-bottom: 6px !important;
            }

            .drawer-head strong {
              font-size: 16px !important;
            }

            .selected-card,
            .job-card {
              border-radius: 16px !important;
              padding: 11px !important;
              margin-bottom: 8px !important;
            }

            .job-title {
              font-size: 17px !important;
            }

            .job-address {
              font-size: 13px !important;
              margin-top: 4px !important;
            }

            .job-sub {
              font-size: 11px !important;
            }

            .detail-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 6px !important;
              margin-top: 8px !important;
            }

            .detail {
              padding: 7px !important;
              border-radius: 10px !important;
            }

            .detail span {
              font-size: 8px !important;
            }

            .detail strong {
              font-size: 11px !important;
            }

            .status-actions {
              gap: 6px !important;
              margin: 8px 0 !important;
            }

            .status-actions button {
              min-height: 34px !important;
              font-size: 11px !important;
              border-radius: 10px !important;
            }

            .card-actions {
              gap: 6px !important;
              margin-top: 8px !important;
            }

            .card-actions a,
            .card-actions button {
              min-height: 36px !important;
              font-size: 11px !important;
              border-radius: 11px !important;
            }

            .maturity-marker-bubble {
              min-width: 38px !important;
              min-height: 30px !important;
              padding: 3px 6px !important;
              border-width: 2px !important;
              box-shadow: 0 8px 20px rgba(0,0,0,.34) !important;
              backdrop-filter: none !important;
            }

            .maturity-marker-bubble strong {
              font-size: 12px !important;
            }
          }
          .selected-card {
            scroll-margin-bottom: 90px;
            animation: selectedCardIn 180ms ease-out;
          }

          @keyframes selectedCardIn {
            from {
              transform: translateY(10px);
              opacity: 0.72;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          .selected-description {
            margin-top: 12px;
            border: 1px solid rgba(66, 232, 243, 0.22);
            background: rgba(255,255,255,0.075);
            border-radius: 18px;
            padding: 12px;
          }

          .description-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 8px;
          }

          .description-head span {
            color: #aebbd0;
            font-size: 10px;
            font-weight: 1000;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .description-head strong {
            color: #c4fbff;
            font-size: 11px;
            font-weight: 1000;
            border: 1px solid rgba(66,232,243,.24);
            background: rgba(66,232,243,.1);
            border-radius: 999px;
            padding: 5px 8px;
          }

          .selected-description p {
            margin: 0;
            color: #f8fbff;
            font-size: 16px;
            line-height: 1.55;
            font-weight: 650;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .job-drawer {
            scroll-behavior: smooth;
          }

          .job-card,
          .selected-card,
          .maturity-marker-bubble {
            transition:
              transform 160ms ease,
              box-shadow 160ms ease,
              border-color 160ms ease,
              background 160ms ease;
          }

          .job-card:active,
          .selected-card:active {
            transform: scale(0.992);
          }

          @media (max-width: 700px) {
            .selected-description {
              max-height: 24dvh;
              overflow: auto;
              -webkit-overflow-scrolling: touch;
              padding: 11px;
              border-radius: 16px;
            }

            .selected-description p {
              font-size: 15px !important;
              line-height: 1.52 !important;
              font-weight: 700;
            }

            .description-head {
              position: sticky;
              top: 0;
              z-index: 2;
              padding-bottom: 6px;
              background: rgba(7,17,31,.96);
              backdrop-filter: none;
            }
          }
          .job-drawer.selected-focus {
            max-height: 70dvh !important;
          }

          .job-drawer.selected-focus .selected-card {
            margin-bottom: 0 !important;
          }

          .job-drawer.selected-focus .drawer-head {
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(7,17,31,.98);
            padding-bottom: 8px;
          }

          @media (max-width: 700px) {
            .job-drawer.selected-focus {
              max-height: 72dvh !important;
            }
          }
        `}</style>

      <header className="map-top">
        <div className="map-title-row">
          <div>
            <h1>Field Operations</h1>
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
            setFullMap((v) => !v);
            setDrawerOpen(false);
            setTimeout(() => mapRef.current?.invalidateSize(), 100);
            setTimeout(() => mapRef.current?.invalidateSize(), 400);
          }}>
            {fullMap ? "Exit Focus" : "Map Focus"}
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

        <div className="status-legend">
          <span><b className="dot completed"></b>Done</span>
          <span><b className="dot refused"></b>Refused</span>
          <span><b className="dot noaccess"></b>No Access</span>
          <span><b className="dot second"></b>2nd</span>
          <span><b className="dot pending"></b>Pending</span>
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

      <aside className={`job-drawer ${drawerOpen ? "" : "closed"} ${selectedOnly ? "selected-focus" : ""}`}>
        <div className="drawer-head">
          <strong>{selectedOnly && selected ? jobKey(selected) : `${filteredJobs.length} jobs`}</strong>
          {selectedOnly ? (
            <button
              type="button"
              onClick={() => {
                setSelectedOnly(false);
                setSelected(null);
                setDrawerOpen(true);
              }}
            >
              Back to List
            </button>
          ) : null}
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

            {selected.description ? (
              <div className="selected-description">
                <div className="description-head">
                  <span>Job Description</span>
                  <strong>Read Mode</strong>
                </div>
                <p>{selected.description}</p>
              </div>
            ) : null}

            <div className="status-actions">
              <button type="button" onClick={() => updateLocalStatus(selected, "No Access - 1st Attempt")}>No Access 1st</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "No Access - 2nd Attempt")}>No Access 2nd</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "Refused Access")}>Refused</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "Work Completed")}>Completed</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "Completed by Others")}>Other Done</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "")}>Clear</button>
            </div>

            <div className="card-actions">
              <button type="button" className="secondary" onClick={() => setDrawerOpen(true)}>Details</button>
              <button
                type="button"
                onClick={() =>
                  generateAffidavit(
                    selected,
                    (selected.StatusOverride || selected.status || "").toLowerCase().includes("completed")
                      ? "completed"
                      : "no_work"
                  )
                }
              >
                Affidavit
              </button>
              <a href={`/invoice-generator?job=${encodeURIComponent(jobKey(selected))}`}>Invoice</a>
              <a target="_blank" rel="noreferrer" href={directionsUrl(selected)}>Directions</a>
            </div>
          </div>
        ) : null}

        {!selectedOnly ? filteredJobs.slice(0, 60).map((job, index) => (
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

            <div className="status-actions">
              <button type="button" onClick={() => updateLocalStatus(selected, "No Access - 1st Attempt")}>No Access 1st</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "No Access - 2nd Attempt")}>No Access 2nd</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "Refused Access")}>Refused</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "Work Completed")}>Completed</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "Completed by Others")}>Other Done</button>
              <button type="button" onClick={() => updateLocalStatus(selected, "")}>Clear</button>
            </div>

            <div className="card-actions">
              <button className="secondary" type="button" onClick={() => focusJob(job)}>Details</button>
              <a className="secondary" href={`/invoice-generator?job=${encodeURIComponent(jobKey(job, index))}`}>Invoice</a>
              <a target="_blank" rel="noreferrer" href={directionsUrl(job)}>Directions</a>
            </div>
          </div>
        )) : null}
        </aside>
    </main>
  );
}

































