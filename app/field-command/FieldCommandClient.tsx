"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FieldTabBar from "../../components/FieldTabBar";

type JobRecord = Record<string, unknown>;

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

const BOROUGHS: { key: BoroughKey; label: string; center: [number, number]; color: string }[] = [
  { key: "MN", label: "Manhattan", center: [40.7831, -73.9712], color: "#0a84ff" },
  { key: "BK", label: "Brooklyn", center: [40.6782, -73.9442], color: "#30d158" },
  { key: "QN", label: "Queens", center: [40.7282, -73.7949], color: "#bf5af2" },
  { key: "BX", label: "Bronx", center: [40.8448, -73.8648], color: "#ff9f0a" },
  { key: "SI", label: "Staten Is.", center: [40.5795, -74.1502], color: "#ff453a" },
];

const STATUS_FILTERS = [
  { key: "all", label: "Status" },
  { key: "open", label: "Open" },
  { key: "awarded", label: "Awarded" },
  { key: "pending", label: "Pending" },
];

function value(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const v = job[key];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return "";
}

function numberValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const n = Number(job[key]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function jobId(job: JobRecord) {
  return value(job, ["OMO", "omo", "OMONumber", "id", "Id"]) || "HPD JOB";
}

function jobAddress(job: JobRecord) {
  return value(job, ["BuildingAddress", "Address", "address", "Location", "location"]) || "Address not captured";
}

function jobBorough(job: JobRecord): BoroughKey | "NYC" {
  const raw = value(job, ["Borough", "borough", "Boro", "boro"]).toUpperCase();
  if (raw.includes("BROOKLYN") || raw === "BK") return "BK";
  if (raw.includes("MANHATTAN") || raw === "MN") return "MN";
  if (raw.includes("BRONX") || raw === "BX") return "BX";
  if (raw.includes("QUEENS") || raw === "QN") return "QN";
  if (raw.includes("STATEN") || raw === "SI") return "SI";
  const zip = jobAddress(job).match(/\b\d{5}\b/)?.[0] || "";
  const z = Number(zip);
  if (z >= 10001 && z <= 10282) return "MN";
  if (z >= 10451 && z <= 10475) return "BX";
  if (z >= 11201 && z <= 11256) return "BK";
  if ((z >= 11004 && z <= 11109) || (z >= 11351 && z <= 11697)) return "QN";
  if (z >= 10301 && z <= 10314) return "SI";
  return "NYC";
}

function jobStatus(job: JobRecord) {
  return (
    value(job, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status", "JobStatus"]) || "Active"
  );
}

type StatusKey = "complete" | "noaccess" | "refused" | "pending" | "awarded" | "open";

const STATUS_ICON_PATHS: Record<StatusKey, string> = {
  complete: '<path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  noaccess:
    '<rect x="6" y="11" width="12" height="9" rx="2" fill="#fff"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
  refused: '<path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  pending:
    '<circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M12 8v4.5l3 2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  awarded:
    '<path d="M12 3.5l2.47 5.18 5.53.63-4.1 3.86 1.08 5.5L12 15.9l-4.98 2.77 1.08-5.5-4.1-3.86 5.53-.63L12 3.5z" fill="#fff"/>',
  open: '<circle cx="12" cy="12" r="4.5" fill="#fff"/>',
};

const STATUS_META: { key: StatusKey; label: string; color: string; match: (s: string, job: JobRecord) => boolean }[] = [
  { key: "complete", label: "Completed", color: "#30d158", match: (s) => s.includes("complete") },
  { key: "noaccess", label: "No Access", color: "#ff9f0a", match: (s) => s.includes("no access") },
  { key: "refused", label: "Refused", color: "#ff453a", match: (s) => s.includes("refused") },
  { key: "pending", label: "Pending", color: "#bf5af2", match: (s) => s.includes("pending") },
  {
    key: "awarded",
    label: "Awarded",
    color: "#0a84ff",
    match: (s, job) => s.includes("award") || jobAwardAmount(job) > 0,
  },
  { key: "open", label: "Open", color: "#64d2ff", match: () => true },
];

function jobStatusMeta(job: JobRecord) {
  const s = jobStatus(job).toLowerCase();
  return STATUS_META.find((meta) => meta.match(s, job)) || STATUS_META[STATUS_META.length - 1];
}

function statusMarkerHtml(color: string, iconKey: StatusKey) {
  return `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.45);display:grid;place-items:center;"><svg width="15" height="15" viewBox="0 0 24 24">${STATUS_ICON_PATHS[iconKey]}</svg></div>`;
}

function jobAwardAmount(job: JobRecord) {
  const raw = value(job, ["AwardAmount", "COAAwardAmount", "Amount", "amount"]);
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function boroughColor(key: BoroughKey | "NYC") {
  return BOROUGHS.find((b) => b.key === key)?.color || "#8e8e93";
}

function directionsHref(job: JobRecord) {
  const ll = jobLatLng(job);
  const query = ll ? `${ll.lat},${ll.lng}` : jobAddress(job);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function statusGroup(job: JobRecord) {
  const s = jobStatus(job).toLowerCase();
  if (s.includes("no access") || s.includes("refused")) return "closed";
  if (s.includes("pending")) return "pending";
  if (s.includes("award") || jobAwardAmount(job) > 0) return "awarded";
  return "open";
}

function jobLatLng(job: JobRecord) {
  const lat = numberValue(job, ["Latitude", "latitude", "Lat", "lat", "_lat"]);
  const lng = numberValue(job, ["Longitude", "longitude", "Lng", "lng", "Lon", "lon", "_lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 40 || lat > 41 || lng > -73 || lng < -75) return null;
  return { lat, lng };
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export default function FieldCommandClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const userLayerRef = useRef<any>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [darkTiles, setDarkTiles] = useState(false);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : data.jobs || data.data || data.records || [];
        setJobs(rows);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((job) => statusGroup(job) !== "closed"),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (borough !== "ALL" && jobBorough(job) !== borough) return false;
      if (status !== "all" && statusGroup(job) !== status) return false;
      if (q) {
        const haystack = [jobId(job), jobAddress(job), jobBorough(job), jobStatus(job)].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, borough, status, search]);

  const boroughCounts = useMemo(() => {
    const counts: Record<BoroughKey, number> = { MN: 0, BK: 0, QN: 0, BX: 0, SI: 0 };
    jobs.forEach((job) => {
      const b = jobBorough(job);
      if (b in counts) counts[b as BoroughKey] += 1;
    });
    return counts;
  }, [jobs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { open: 0, awarded: 0, pending: 0 };
    jobs.forEach((job) => {
      const g = statusGroup(job);
      if (g in counts) counts[g] += 1;
    });
    return counts;
  }, [jobs]);

  const mappedCount = useMemo(() => jobs.filter((job) => jobLatLng(job)).length, [jobs]);

  useEffect(() => {
    const previousBg = document.body.style.background;
    document.body.style.background = "#05070c";
    return () => {
      document.body.style.background = previousBg;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      if (!mapNode.current) return;
      const leafletModule = await import("leaflet");
      const L = (leafletModule as any).default || leafletModule;
      if (cancelled || !mapNode.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([40.72, -73.95], 10);
        tileLayerRef.current = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          { maxZoom: 20 }
        ).addTo(mapRef.current);
        userLayerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      if (layerRef.current) {
        layerRef.current.clearLayers();
      } else {
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const showIndividualPins = borough !== "ALL" || search.trim().length > 0;

      if (showIndividualPins) {
        const bounds: [number, number][] = [];
        filteredJobs.forEach((job) => {
          const ll = jobLatLng(job);
          if (!ll) return;
          const meta = jobStatusMeta(job);
          const icon = L.divIcon({
            className: "",
            html: statusMarkerHtml(meta.color, meta.key),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = L.marker([ll.lat, ll.lng], { icon });
          marker.bindTooltip(`${jobId(job)} - ${meta.label}`, { direction: "top" });
          marker.on("click", () => setSelectedJob(job));
          marker.addTo(layerRef.current);
          bounds.push([ll.lat, ll.lng]);
        });

        if (bounds.length === 1) {
          mapRef.current.setView(bounds[0], 15);
        } else if (bounds.length) {
          mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
        return;
      }

      const jobsByBorough: Record<BoroughKey, JobRecord[]> = { MN: [], BK: [], QN: [], BX: [], SI: [] };
      filteredJobs.forEach((job) => {
        const b = jobBorough(job);
        if (b in jobsByBorough) jobsByBorough[b as BoroughKey].push(job);
      });

      const bounds: [number, number][] = [];
      BOROUGHS.forEach(({ key, center, color }) => {
        const list = jobsByBorough[key];
        if (!list.length) return;
        const radius = Math.max(16, Math.min(46, 14 + Math.sqrt(list.length) * 6));
        const marker = L.circleMarker(center, {
          radius,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.55,
        });
        marker.bindTooltip(`${key} - ${list.length} jobs`, { direction: "top" });
        marker.on("click", () => setBorough(key));
        marker.addTo(layerRef.current);

        const label = L.divIcon({
          className: "",
          html: `<div style="display:grid;place-items:center;width:100%;height:100%;color:#fff;font-weight:900;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none;">${list.length}</div>`,
          iconSize: [radius * 2, radius * 2],
        });
        L.marker(center, { icon: label, interactive: false }).addTo(layerRef.current);
        bounds.push(center);
      });

      if (bounds.length) {
        mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      }
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [filteredJobs, borough, search]);

  useEffect(() => {
    if (selectedJob && !filteredJobs.includes(selectedJob)) {
      setSelectedJob(null);
    }
  }, [filteredJobs, selectedJob]);

  useEffect(() => {
    if (locateStatus !== "error") return;
    const timer = setTimeout(() => setLocateStatus("idle"), 4000);
    return () => clearTimeout(timer);
  }, [locateStatus]);

  const mappedFilteredCount = useMemo(
    () => filteredJobs.filter((job) => jobLatLng(job)).length,
    [filteredJobs]
  );

  function toggleTileStyle() {
    setDarkTiles((prev) => {
      const next = !prev;
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(
          next
            ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        );
      }
      return next;
    });
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setLocateStatus("error");
      return;
    }
    setLocateStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setLocateStatus("idle");
        const { latitude, longitude } = position.coords;
        if (!mapRef.current || !userLayerRef.current) return;
        const leafletModule = await import("leaflet");
        const L = (leafletModule as any).default || leafletModule;
        userLayerRef.current.clearLayers();
        const dot = L.divIcon({
          className: "",
          html: '<div class="fc-you-are-here"><span class="fc-you-are-here-pulse"></span></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        L.marker([latitude, longitude], { icon: dot, interactive: false }).addTo(userLayerRef.current);
        mapRef.current.setView([latitude, longitude], 15);
      },
      () => setLocateStatus("error"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <main className="fc-app">
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <span className="fc-brand-icon">HPD</span>
            <div className="fc-brand-copy">
              <p className="fc-eyebrow">HPD Bid Dashboard 2026</p>
              <h1 className="fc-title">HPD Field Command</h1>
            </div>
          </div>
          <div className="fc-topbar-actions">
            <button type="button" className="fc-icon-btn" aria-label="Alerts">
              <BellIcon />
              <span className="fc-icon-badge">6</span>
            </button>
            <Link href="/" className="fc-icon-btn" aria-label="Menu">
              <MenuIcon />
            </Link>
          </div>
        </div>
        <div className="fc-live-row">
          <span className="fc-live-dot">Live</span>
          <span className="fc-active-count">{activeJobs.length} Active Jobs</span>
        </div>
      </header>

      <div className="fc-pill-row" role="group" aria-label="Borough filter">
        <button type="button" className={`fc-pill ${borough === "ALL" ? "is-active" : ""}`} onClick={() => setBorough("ALL")}>
          <strong>All</strong>
          <span>{jobs.length}</span>
        </button>
        {BOROUGHS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`fc-pill fc-${key.toLowerCase()} ${borough === key ? "is-active" : ""}`}
            onClick={() => setBorough(key)}
          >
            <strong>{key}</strong>
            <span>{boroughCounts[key]}</span>
          </button>
        ))}
      </div>

      <div className="fc-pill-row fc-status-pill-row" role="group" aria-label="Status filter">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`fc-pill ${status === key ? "is-active" : ""}`}
            onClick={() => setStatus(key)}
          >
            <strong>{label}</strong>
            <span>{key === "all" ? jobs.length : statusCounts[key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="fc-search-row">
        <div className="fc-search-field">
          <SearchIcon />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search jobs, address, OMO, tenant..."
            aria-label="Search jobs"
          />
        </div>
        <button type="button" className="fc-search-list-btn" aria-label="View as list">
          <ListIcon />
        </button>
      </div>

      <div className="fc-map-wrap">
        <div ref={mapNode} className="fc-map-node" />
        <div className="fc-map-controls">
          <button
            type="button"
            className={`fc-map-fab ${locateStatus === "loading" ? "is-busy" : ""}`}
            aria-label="Locate me"
            onClick={locateMe}
          >
            <LocateIcon />
          </button>
          <button
            type="button"
            className={`fc-map-fab ${darkTiles ? "is-active" : ""}`}
            aria-label="Toggle map style"
            onClick={toggleTileStyle}
          >
            <LayersIcon />
          </button>
        </div>
        <div className="fc-visible-badge">
          <strong>{filteredJobs.length}</strong>
          <span>Visible Jobs</span>
        </div>

        {locateStatus === "error" ? (
          <p className="fc-map-hint fc-map-hint-warn">Couldn&apos;t get your location</p>
        ) : null}

        {(borough !== "ALL" || search.trim()) && !filteredJobs.length ? (
          <p className="fc-map-hint">No jobs match these filters</p>
        ) : null}

        {(borough !== "ALL" || search.trim()) && filteredJobs.length > 0 && !mappedFilteredCount ? (
          <p className="fc-map-hint">No mapped jobs match these filters</p>
        ) : null}

        {borough !== "ALL" && !selectedJob ? (
          <div className="fc-legend">
            {STATUS_META.map((meta) => (
              <span key={meta.key} className="fc-legend-chip">
                <span
                  className="fc-legend-dot"
                  style={{ background: meta.color }}
                  dangerouslySetInnerHTML={{ __html: `<svg width="10" height="10" viewBox="0 0 24 24">${STATUS_ICON_PATHS[meta.key]}</svg>` }}
                />
                {meta.label}
              </span>
            ))}
          </div>
        ) : null}

        {selectedJob ? (
          <div className="fc-job-sheet">
            <button type="button" className="fc-job-sheet-close" aria-label="Close" onClick={() => setSelectedJob(null)}>
              &times;
            </button>
            <div className="fc-job-sheet-tags">
              <span className="fc-job-sheet-tag" style={{ background: boroughColor(jobBorough(selectedJob)) }}>
                {jobBorough(selectedJob)}
              </span>
              <span className="fc-job-sheet-tag" style={{ background: jobStatusMeta(selectedJob).color }}>
                {jobStatusMeta(selectedJob).label}
              </span>
            </div>
            <strong className="fc-job-sheet-id">{jobId(selectedJob)}</strong>
            <p className="fc-job-sheet-address">{jobAddress(selectedJob)}</p>
            <div className="fc-job-sheet-meta">
              <span>{jobStatus(selectedJob)}</span>
              {jobAwardAmount(selectedJob) ? <span>${jobAwardAmount(selectedJob).toLocaleString()}</span> : null}
            </div>
            <a className="fc-job-sheet-action" href={directionsHref(selectedJob)} target="_blank" rel="noreferrer">
              Directions
            </a>
          </div>
        ) : null}
      </div>

      <FieldTabBar />
    </main>
  );
}
