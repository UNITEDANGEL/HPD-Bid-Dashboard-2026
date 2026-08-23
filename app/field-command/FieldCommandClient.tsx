"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FieldTabBar from "../../components/FieldTabBar";
import PlanMyDayDrawer from "../map/PlanMyDayDrawer";
import "../map/plan-my-day.css";

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

function jobScope(job: JobRecord) {
  return (
    value(job, [
      "ItbPage3Description",
      "JobDescription",
      "Job_Description",
      "Description",
      "description",
      "Scope",
      "scope",
    ])
      .replace(/^job description:\s*/i, "")
      .replace(/^:\s*/, "")
      .trim() || "Scope not captured yet."
  );
}

function tenantInfo(job: JobRecord) {
  const apt = value(job, ["ItbTenantApartment", "ApartmentUnit", "Apartment", "Apt", "apt"]);
  const name = value(job, ["ItbTenantName", "TenantName", "tenantName", "Tenant", "tenant"]);
  const phone = value(job, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "Phone", "phone"]);
  const accessType = value(job, ["ItbTenantAccessType", "TenantAccessType"]);
  const status = value(job, ["ItbTenantContactStatus", "TenantContactStatus"]);
  const commonArea = accessType.toLowerCase().includes("common") || status.toLowerCase().includes("common");
  return {
    apt,
    name: name && name.toUpperCase() !== "T" ? name : "",
    phone,
    commonArea,
    label: commonArea ? "Public area" : "Tenant contact",
    summary: commonArea
      ? "No tenant appointment needed"
      : [apt ? `Apt ${apt}` : "", name && name.toUpperCase() !== "T" ? name : "", phone || "Request contact from HPD"]
          .filter(Boolean)
          .join(" · "),
  };
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
  complete:
    '<g transform="rotate(45 12 12)"><rect x="10" y="2" width="4" height="9" rx="1" fill="#fff"/><rect x="6" y="9" width="12" height="5" rx="1.5" fill="#fff"/></g>',
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
  { key: "pending", label: "Pending", color: "#0a84ff", match: (s) => s.includes("pending") },
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

function parseUsDate(raw: string) {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  const year = yr.length === 2 ? 2000 + Number(yr) : Number(yr);
  const date = new Date(year, Number(mo) - 1, Number(da));
  return Number.isNaN(date.getTime()) ? null : date;
}

function jobAgeDays(job: JobRecord) {
  const raw = value(job, ["AwardDate", "awardDate", "WorkStartDate", "workStartDate"]);
  if (!raw) return null;
  const date = parseUsDate(raw);
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function ageMarkerHtml(color: string, days: number | null) {
  const label = days === null ? "?" : String(days);
  const fontSize = label.length > 2 ? 10 : 12;
  return `<div style="position:relative;width:30px;height:30px;">` +
    `<div style="position:absolute;inset:-9px;border-radius:50%;background:radial-gradient(circle, ${color}59, transparent 68%);"></div>` +
    `<div style="position:relative;width:30px;height:30px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.92);box-shadow:0 0 10px ${color},0 0 24px ${color}80,0 3px 8px rgba(0,0,0,.5);display:grid;place-items:center;color:#fff;font-weight:900;font-size:${fontSize}px;font-family:-apple-system,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.5);">${label}</div>` +
    `</div>`;
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

function wazeHref(job: JobRecord) {
  const ll = jobLatLng(job);
  if (ll) return `https://waze.com/ul?ll=${ll.lat},${ll.lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(jobAddress(job))}&navigate=yes`;
}

function formatSavedTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
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

const LIGHT_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CLUSTER_COLOR = "#38bdf8";

function clusterByPixelDistance(
  points: { job: JobRecord; lng: number; lat: number }[],
  map: any,
  radiusPx: number
) {
  const projected = points.map((p) => ({ ...p, screen: map.latLngToContainerPoint([p.lat, p.lng]) }));
  const clusters: { lng: number; lat: number; jobs: JobRecord[] }[] = [];
  const used = new Array(projected.length).fill(false);

  for (let i = 0; i < projected.length; i += 1) {
    if (used[i]) continue;
    const group = [projected[i]];
    used[i] = true;
    for (let j = i + 1; j < projected.length; j += 1) {
      if (used[j]) continue;
      const dx = projected[i].screen.x - projected[j].screen.x;
      const dy = projected[i].screen.y - projected[j].screen.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) {
        group.push(projected[j]);
        used[j] = true;
      }
    }
    const lng = group.reduce((sum, p) => sum + p.lng, 0) / group.length;
    const lat = group.reduce((sum, p) => sum + p.lat, 0) / group.length;
    clusters.push({ lng, lat, jobs: group.map((p) => p.job) });
  }

  return clusters;
}

function clusterMarkerHtml(count: number) {
  const size = Math.min(56, Math.max(34, 26 + Math.sqrt(count) * 7));
  const glow = Math.round(size * 0.35);
  const fontSize = Math.min(16, 11 + count / 40);
  return `<div style="position:relative;width:${size}px;height:${size}px;">` +
    `<div style="position:absolute;inset:-${glow}px;border-radius:50%;background:radial-gradient(circle, ${CLUSTER_COLOR}59, transparent 68%);"></div>` +
    `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${CLUSTER_COLOR};border:3px solid rgba(255,255,255,.92);box-shadow:0 0 14px ${CLUSTER_COLOR},0 0 32px ${CLUSTER_COLOR}77,0 4px 10px rgba(0,0,0,.5);display:grid;place-items:center;color:#fff;font-weight:900;font-size:${fontSize}px;text-shadow:0 1px 2px rgba(0,0,0,.5);">${count}</div>` +
    `</div>`;
}

export default function FieldCommandClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const pointsRef = useRef<{ job: JobRecord; lng: number; lat: number }[]>([]);
  const renderMarkersRef = useRef<() => void>(() => {});
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [darkTiles, setDarkTiles] = useState(true);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [workflowStamps, setWorkflowStamps] = useState<Record<string, { arrived?: string; visit?: string; work?: string; status?: string }>>({});
  const [headerHidden, setHeaderHidden] = useState(false);
  const headerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hpd-field-command-workflow");
      if (saved) setWorkflowStamps(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("hpd-field-command-workflow", JSON.stringify(workflowStamps));
    } catch {}
  }, [workflowStamps]);

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

  useEffect(() => {
    if (!jobs.length) return;
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("omo") || params.get("job") || params.get("q") || "").trim().toUpperCase();
    if (!requested || selectedJob) return;
    const match = jobs.find((job) => jobId(job).toUpperCase() === requested);
    if (match) {
      setSelectedJob(match);
      setSearch(requested);
      const boro = jobBorough(match);
      if (boro !== "NYC") setBorough(boro);
    }
  }, [jobs, selectedJob]);

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

      const points = filteredJobs
        .map((job) => {
          const ll = jobLatLng(job);
          return ll ? { job, lng: ll.lng, lat: ll.lat } : null;
        })
        .filter((p): p is { job: JobRecord; lng: number; lat: number } => p !== null);
      pointsRef.current = points;

      if (!mapRef.current) {
        const map = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: true,
        }).setView([40.72, -73.95], 10);
        mapRef.current = map;
        tileLayerRef.current = L.tileLayer(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL, { maxZoom: 20 }).addTo(map);
        layerGroupRef.current = L.layerGroup().addTo(map);

        renderMarkersRef.current = () => {
          if (!layerGroupRef.current) return;
          layerGroupRef.current.clearLayers();
          const clusters = clusterByPixelDistance(pointsRef.current, map, 44);

          clusters.forEach((cluster) => {
            let html: string;
            let onClick: () => void;
            let title: string;

            if (cluster.jobs.length === 1) {
              const job = cluster.jobs[0];
              const meta = jobStatusMeta(job);
              const days = jobAgeDays(job);
              html = ageMarkerHtml(meta.color, days);
              title = `${jobId(job)} - ${meta.label} - ${days === null ? "age unknown" : `${days}d old`}`;
              onClick = () => setSelectedJob(job);
            } else {
              html = clusterMarkerHtml(cluster.jobs.length);
              title = `${cluster.jobs.length} jobs`;
              onClick = () => {
                map.flyTo([cluster.lat, cluster.lng], Math.min(20, map.getZoom() + 2.5));
              };
            }

            const icon = L.divIcon({ className: "", html, iconSize: [30, 30], iconAnchor: [15, 15] });
            const marker = L.marker([cluster.lat, cluster.lng], { icon, title });
            marker.on("click", onClick);
            marker.addTo(layerGroupRef.current);
          });
        };

        map.on("moveend", () => renderMarkersRef.current());

        map.on("movestart zoomstart dragstart", () => {
          if (headerIdleTimerRef.current) clearTimeout(headerIdleTimerRef.current);
          setHeaderHidden(true);
        });
        map.on("moveend zoomend dragend", () => {
          if (headerIdleTimerRef.current) clearTimeout(headerIdleTimerRef.current);
          headerIdleTimerRef.current = setTimeout(() => setHeaderHidden(false), 1000);
        });
      }

      const map = mapRef.current;

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 15);
      } else if (points.length > 1) {
        const bounds = points.map((p) => [p.lat, p.lng]) as [number, number][];
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
      renderMarkersRef.current();
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [filteredJobs, borough, search]);

  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL);
  }, [darkTiles]);

  useEffect(() => {
    if (selectedJob && !filteredJobs.includes(selectedJob)) {
      setSelectedJob(null);
    }
  }, [filteredJobs, selectedJob]);

  useEffect(() => {
    setScopeOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedJob]);

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
    setDarkTiles((prev) => !prev);
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
        if (!mapRef.current) return;
        const leafletModule = await import("leaflet");
        const L = (leafletModule as any).default || leafletModule;
        if (userMarkerRef.current) userMarkerRef.current.remove();
        const icon = L.divIcon({
          className: "",
          html: '<div class="fc-you-are-here"><span class="fc-you-are-here-pulse"></span></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        userMarkerRef.current = L.marker([latitude, longitude], { icon, interactive: false }).addTo(mapRef.current);
        mapRef.current.flyTo([latitude, longitude], 15);
      },
      () => setLocateStatus("error"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function saveWorkflowStamp(job: JobRecord, key: "arrived" | "visit" | "work" | "status", statusLabel?: string) {
    const id = jobId(job);
    const now = new Date().toISOString();
    setWorkflowStamps((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: now,
        ...(statusLabel ? { status: statusLabel } : {}),
      },
    }));
  }

  return (
    <main className={`fc-app ${selectedJob ? "fc-has-job" : ""} ${controlsOpen ? "fc-controls-open" : ""} ${headerHidden && !selectedJob ? "fc-header-hidden" : ""}`}>
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
        <button
          type="button"
          className={`fc-search-list-btn fc-tools-toggle ${controlsOpen ? "is-open" : ""}`}
          aria-label={controlsOpen ? "Hide map filters" : "Show map filters"}
          onClick={() => setControlsOpen((open) => !open)}
        >
          <ListIcon />
          <span>Tools</span>
        </button>
      </div>

      <section className="fc-control-drawer" aria-label="Map filters">
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
      </section>

      <div className="fc-map-wrap">
        <div ref={mapNode} className={`fc-map-node ${darkTiles ? "is-dark" : ""}`} />
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

        {!filteredJobs.length ? (
          <p className="fc-map-hint">No jobs match these filters</p>
        ) : null}

        {filteredJobs.length > 0 && !mappedFilteredCount ? (
          <p className="fc-map-hint">No mapped jobs match these filters</p>
        ) : null}

        {!selectedJob ? (
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

        {selectedJob ? (() => {
          const id = jobId(selectedJob);
          const scope = jobScope(selectedJob);
          const tenant = tenantInfo(selectedJob);
          const stamps = workflowStamps[id] || {};
          return (
            <div className="fc-job-sheet fc-job-sheet-flow">
              <button type="button" className="fc-job-sheet-close" aria-label="Close" onClick={() => setSelectedJob(null)}>
                Map
              </button>
              <div className="fc-job-sheet-hero">
                <div>
                  <span className="fc-job-sheet-kicker">OMO</span>
                  <strong className="fc-job-sheet-id">{id}</strong>
                  <div className={`fc-arrival-pill ${stamps.arrived ? "is-saved" : ""}`}>
                    <span>{stamps.arrived ? "Arrived saved" : "Not here yet"}</span>
                    <b>{stamps.arrived ? formatSavedTime(stamps.arrived) : "Tap Arrive"}</b>
                  </div>
                </div>
                <span className="fc-building-icon" aria-hidden="true">HPD</span>
              </div>
              <div className="fc-address-row">
                <p>{jobAddress(selectedJob)}</p>
                <a className="fc-route-btn fc-route-waze" href={wazeHref(selectedJob)} target="_blank" rel="noreferrer">Waze</a>
                <a className="fc-route-btn fc-route-google" href={directionsHref(selectedJob)} target="_blank" rel="noreferrer">Google</a>
              </div>
              <div className="fc-job-sheet-tags">
                <span className="fc-job-sheet-tag" style={{ background: boroughColor(jobBorough(selectedJob)) }}>
                  {jobBorough(selectedJob)}
                </span>
                <span className="fc-job-sheet-tag" style={{ background: jobStatusMeta(selectedJob).color }}>
                  {stamps.status || jobStatusMeta(selectedJob).label}
                </span>
                {jobAgeDays(selectedJob) !== null ? <span className="fc-job-sheet-tag fc-age-tag">{jobAgeDays(selectedJob)}d old</span> : null}
              </div>
              <section className={`fc-flow-card fc-scope-card ${scopeOpen ? "is-open" : ""}`}>
                <button type="button" className="fc-flow-card-main" onClick={() => setScopeOpen((open) => !open)}>
                  <span className="fc-flow-icon">S</span>
                  <span>
                    <b>Complete Scope</b>
                    <small>{scope}</small>
                  </span>
                  <strong>{scopeOpen ? "Close" : "Open"}</strong>
                </button>
                {scopeOpen ? <p className="fc-scope-full">{scope}</p> : null}
              </section>
              <section className="fc-flow-card fc-tenant-card">
                <div className="fc-flow-card-main">
                  <span className="fc-flow-icon tenant">T</span>
                  <span>
                    <b>{tenant.label}</b>
                    <small>{tenant.summary}</small>
                  </span>
                  {tenant.phone ? <a className="fc-call-btn" href={`tel:${tenant.phone}`}>Call</a> : null}
                </div>
              </section>
              <section className="fc-workflow-panel" aria-label="Field workflow">
                <button type="button" className={`fc-workflow-btn ${stamps.arrived ? "is-saved" : ""}`} onClick={() => saveWorkflowStamp(selectedJob, "arrived")}>
                  <span>1</span>
                  <b>{stamps.arrived ? "Arrived Saved" : "Arrive"}</b>
                  <small>{stamps.arrived ? formatSavedTime(stamps.arrived) : "I am here"}</small>
                </button>
                <button type="button" className={`fc-workflow-btn ${stamps.visit ? "is-saved" : ""}`} onClick={() => saveWorkflowStamp(selectedJob, "visit")} disabled={!stamps.arrived}>
                  <span>2</span>
                  <b>{stamps.visit ? "Visit Started" : "Start Visit"}</b>
                  <small>{stamps.visit ? formatSavedTime(stamps.visit) : stamps.arrived ? "Begin visit" : "Arrive first"}</small>
                </button>
                <button type="button" className={`fc-workflow-btn ${stamps.work ? "is-saved" : ""}`} onClick={() => saveWorkflowStamp(selectedJob, "work", "Work Started")} disabled={!stamps.visit}>
                  <span>3</span>
                  <b>{stamps.work ? "Work Started" : "Start Work"}</b>
                  <small>{stamps.work ? formatSavedTime(stamps.work) : "Before media next"}</small>
                </button>
                <button type="button" className="fc-workflow-btn no-access" onClick={() => saveWorkflowStamp(selectedJob, "status", "No Access")} disabled={!stamps.visit}>
                  <span>4</span>
                  <b>No Access</b>
                  <small>Save attempt</small>
                </button>
                <button type="button" className="fc-workflow-btn refused" onClick={() => saveWorkflowStamp(selectedJob, "status", "Refused")} disabled={!stamps.visit}>
                  <span>5</span>
                  <b>Refused</b>
                  <small>Close job</small>
                </button>
                <button type="button" className="fc-workflow-btn clear" onClick={() => setWorkflowStamps((prev) => ({ ...prev, [id]: {} }))}>
                  <span>0</span>
                  <b>Clear</b>
                  <small>Reset test</small>
                </button>
              </section>
            </div>
          );
        })() : null}
      </div>

      <PlanMyDayDrawer />
      <FieldTabBar />
    </main>
  );
}
