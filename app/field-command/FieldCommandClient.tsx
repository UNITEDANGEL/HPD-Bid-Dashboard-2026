"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FieldTabBar from "../../components/FieldTabBar";
import { jobPriority, maturityDate, isPendingJob } from "../../lib/job-priority";
import { listFieldEvidence, saveFieldPhotos, type FieldMediaKind } from "../../lib/field-photo-store";
import PlanMyDayDrawer from "../map/PlanMyDayDrawer";
import "../map/plan-my-day.css";
import "maplibre-gl/dist/maplibre-gl.css";

type JobRecord = Record<string, unknown>;

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

const FIELD_WORKFLOW_STORAGE_KEY = "hpd-field-command-workflow";
const SHARED_WORKFLOW_STORAGE_KEY = "hpd-job-workflow-overrides-v2";

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

function readJsonObject(key: string) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readSharedWorkflowOverrides() {
  const parsed = readJsonObject(SHARED_WORKFLOW_STORAGE_KEY);
  const overrides = parsed.overrides && typeof parsed.overrides === "object" && !Array.isArray(parsed.overrides)
    ? parsed.overrides
    : parsed;
  return overrides as Record<string, Record<string, unknown>>;
}

function writeSharedWorkflowPatch(id: string, patch: Record<string, unknown>) {
  if (typeof window === "undefined" || !id) return;
  const previous = readSharedWorkflowOverrides();
  window.localStorage.setItem(
    SHARED_WORKFLOW_STORAGE_KEY,
    JSON.stringify({
      ...previous,
      [id]: {
        ...(previous[id] || {}),
        ...patch,
        updatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    })
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

function ageMarkerHtml(days: number | null, pending: boolean) {
  const label = !pending ? "Done" : days === null ? "?" : days === 0 ? "Due" : days < 0 ? `+${-days}` : String(days);
  const overdue = days !== null && days > 30;
  const fill = !pending || days === null ? "#64717d" : overdue ? "#c73843" : "#007aff";
  return `<div class="fc-work-pin" style="--pin-color:${fill}"><svg viewBox="0 0 24 24" aria-hidden="true">${HARDHAT_ICON_PATH}</svg><span>${label}${days !== null && days > 0 && pending ? "d" : ""}</span></div>`;
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

function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

function googleRouteHref(points: { lat: number; lng: number }[]) {
  if (points.length < 2) return "https://www.google.com/maps";
  const [origin, ...rest] = points;
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
  });
  if (waypoints.length) params.set("waypoints", waypoints.map((p) => `${p.lat},${p.lng}`).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
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

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.2 18 15 8a3 3 0 0 1 3-1.5" />
    </svg>
  );
}

function NavigateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l18-8-8 18-2.5-7.5L3 11z" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PhotosIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

function DocumentsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

const LIGHT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const DARK_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
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

const HARDHAT_ICON_PATH =
  '<path d="M4 12.5A8 8 0 0 1 20 12.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="2.5" y="12" width="19" height="2.6" rx="1.3" fill="#fff"/>' +
  '<rect x="11" y="6.5" width="2" height="3.5" rx="1" fill="#fff"/>';

function boroughLabelHtml(label: string, dark: boolean) {
  const style = dark
    ? "color:rgba(255,255,255,.88);text-shadow:0 1px 4px rgba(0,0,0,.9),0 1px 8px rgba(0,0,0,.7);"
    : "color:rgba(71,85,105,.85);text-shadow:0 1px 0 rgba(255,255,255,.55),-1px 0 0 rgba(255,255,255,.4),1px 0 0 rgba(255,255,255,.4),0 -1px 0 rgba(255,255,255,.4);";
  return `<span style="display:inline-block;${style}font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;pointer-events:none;">${label}</span>`;
}

function clusterMarkerHtml(count: number, oldestDays: number | null) {
  const size = count > 99 ? 42 : 34;
  const age = oldestDays !== null && oldestDays > 30
    ? `<span style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:#921f32;border:1px solid #f36e7d;border-radius:4px;padding:1px 4px;font-size:8px;white-space:nowrap;">${oldestDays}d</span>`
    : "";
  return `<div style="position:relative;width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:50%;background:#004bea;border:2px solid #59b9ff;box-shadow:0 0 0 3px #005fff33,0 2px 6px #0005;color:#fff;font-size:14px;font-weight:800;">${count}${age}</div>`;
}

export default function FieldCommandClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const vectorLayerRef = useRef<any>(null);
  const darkTilesRef = useRef(false);
  const layerGroupRef = useRef<any>(null);
  const boroughLabelLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const pointsRef = useRef<{ job: JobRecord; lng: number; lat: number }[]>([]);
  const renderMarkersRef = useRef<() => void>(() => {});
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState("all");
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [darkTiles, setDarkTiles] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [routeSummary, setRouteSummary] = useState<{ stops: number; miles: number; firstStop: string; href: string } | null>(null);
  const [workflowStamps, setWorkflowStamps] = useState<Record<string, { arrived?: string; visit?: string; work?: string; status?: string }>>({});
  const [mediaCounts, setMediaCounts] = useState<Record<string, { before: number; after: number; total: number }>>({});
  const [mediaBusy, setMediaBusy] = useState("");
  const [mediaMessage, setMediaMessage] = useState("");
  const [clearJobId, setClearJobId] = useState("");
  const [clearText, setClearText] = useState("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMediaKindRef = useRef<FieldMediaKind>("before");
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
      const saved = window.localStorage.getItem(FIELD_WORKFLOW_STORAGE_KEY);
      if (saved) setWorkflowStamps(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FIELD_WORKFLOW_STORAGE_KEY, JSON.stringify(workflowStamps));
    } catch {}
  }, [workflowStamps]);

  const activeJobs = useMemo(
    () => jobs.filter(isPendingJob),
    [jobs]
  );

  const overdueCount = useMemo(
    () => activeJobs.filter((job) => {
      const days = jobPriority(job).days;
      return days !== null && days > 30;
    }).length,
    [activeJobs]
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const exactOmoQuery = q.toUpperCase().match(/^[A-Z]{1,3}\d{4,8}$/) ? q.toUpperCase() : "";
    return jobs.filter((job) => {
      if (exactOmoQuery && jobId(job).toUpperCase() === exactOmoQuery) return true;
      if (daysBack !== null) {
        const age = jobAgeDays(job);
        if (age === null || age > daysBack) return false;
      }
      if (borough !== "ALL" && jobBorough(job) !== borough) return false;
      if (status !== "all" && statusGroup(job) !== status) return false;
      if (q) {
        const haystack = [jobId(job), jobAddress(job), jobBorough(job), jobStatus(job)].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, borough, status, search, daysBack]);

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
        tileLayerRef.current = L.tileLayer(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL, { maxZoom: 20, maxNativeZoom: darkTiles ? 16 : 19, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, contributors' }).addTo(map);
        // Keep raster streets underneath until the vector map is ready, including on unsupported devices.
        import("@maplibre/maplibre-gl-leaflet").then(async ({ maplibreGL }) => {
          const { setWorkerUrl } = await import("maplibre-gl");
          setWorkerUrl("/map-worker/maplibre-gl-worker.mjs");
          if (mapRef.current !== map) return;
          let vector: any;
          try {
            vector = maplibreGL({
              style: "https://tiles.openfreemap.org/styles/liberty",
              attributionControl: false,
              interactive: false,
              pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
            }).addTo(map);
            vectorLayerRef.current = vector;
            vector.getContainer().style.opacity = darkTilesRef.current ? "0" : "1";
            const gl = vector.getMaplibreMap();
            gl.once("style.load", () => {
              for (const layer of gl.getStyle().layers) {
                if (layer.type === "background") gl.setPaintProperty(layer.id, "background-color", "#d8dfdc");
                if (layer.type === "fill") {
                  const colors: Record<string, string> = {
                    water: "#83b7ca", landuse_residential: "#d4dcd8", building: "#b6c2bd",
                    park: "#a5c59a", landcover_wood: "#96b98c", landcover_grass: "#b0cda4",
                  };
                  if (colors[layer.id]) gl.setPaintProperty(layer.id, "fill-color", colors[layer.id]);
                }
                if (layer.type === "line" && /^(road|bridge|tunnel)_/.test(layer.id) && !/rail|path/.test(layer.id)) {
                  gl.setPaintProperty(layer.id, "line-color", layer.id.endsWith("_casing") ? "#aab8b5" : "#edf0eb");
                }
              }
            });
            gl.once("load", () => {
              if (mapRef.current !== map || vectorLayerRef.current !== vector) return;
              vector.getContainer().dataset.ready = "true";
              vector.getContainer().style.opacity = darkTilesRef.current ? "0" : "1";
              map.attributionControl.addAttribution('<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>');
            });
            gl.on("error", (event: { error?: Error }) => {
              console.warn("Clean Streets map unavailable; using street-map fallback.", event.error?.message);
              // A failed style or tile must not leave an empty map above the fallback.
              if (vectorLayerRef.current === vector) vector.getContainer().style.opacity = "0";
            });
          } catch {
            vector?.remove();
            vectorLayerRef.current = null;
          }
        }).catch(() => { /* Raster streets remain available if the vector bundle cannot load. */ });
        L.control.scale({ position: "bottomright", metric: false, imperial: true }).addTo(map);

        map.createPane("boroughLabels");
        map.getPane("boroughLabels").style.zIndex = "350";
        map.getPane("boroughLabels").style.pointerEvents = "none";

        boroughLabelLayerRef.current = L.layerGroup(
          BOROUGHS.map((b) =>
            L.marker(b.center, {
              icon: L.divIcon({ className: "", html: boroughLabelHtml(b.label, darkTiles), iconSize: [140, 24], iconAnchor: [70, 12] }),
              interactive: false,
              pane: "boroughLabels",
            })
          )
        ).addTo(map);

        const updateBoroughLabelVisibility = () => {
          const visible = map.getZoom() <= 12;
          boroughLabelLayerRef.current?.eachLayer((layer: any) => {
            layer.setOpacity(visible ? 1 : 0);
          });
        };
        map.on("zoomend", updateBoroughLabelVisibility);
        updateBoroughLabelVisibility();

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
              const priority = jobPriority(job);
              const days = priority.days;
              html = ageMarkerHtml(days, priority.pending);
              title = `${jobId(job)} - ${meta.label} - ${priority.label}`;
              onClick = () => setSelectedJob(job);
            } else {
              const ages = cluster.jobs.map((job) => jobPriority(job).days).filter((d): d is number => d !== null);
              const oldestDays = ages.length ? Math.max(...ages) : null;
              html = clusterMarkerHtml(cluster.jobs.length, oldestDays);
              title = `${cluster.jobs.length} jobs${oldestDays !== null && oldestDays > 0 ? ` - most overdue ${oldestDays} days` : ""}`;
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
      } else if (points.length > 1 && borough === "ALL" && !search.trim()) {
        // Keep the initial city view useful even when a record lies far outside NYC.
        map.setView([40.72, -73.95], 11);
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
    darkTilesRef.current = darkTiles;
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.options.maxNativeZoom = darkTiles ? 16 : 19;
    tileLayerRef.current.setUrl(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL);
    const container = vectorLayerRef.current?.getContainer();
    if (container) container.style.opacity = !darkTiles && container.dataset.ready === "true" ? "1" : "0";
  }, [darkTiles]);

  useEffect(() => () => {
    if (headerIdleTimerRef.current) clearTimeout(headerIdleTimerRef.current);
    mapRef.current?.remove();
    mapRef.current = null;
    vectorLayerRef.current = null;
  }, []);

  useEffect(() => {
    setRouteSummary(null);
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
  }, [borough, status, search, daysBack]);

  useEffect(() => {
    if (selectedJob && !filteredJobs.includes(selectedJob)) {
      setSelectedJob(null);
    }
  }, [filteredJobs, selectedJob]);

  useEffect(() => {
    setScopeOpen(false);
    setSheetExpanded(false);
    if (selectedJob) setControlsOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedJob]);

  useEffect(() => {
    let cancelled = false;
    setSelectedPhoto(null);
    if (selectedJob) {
      listFieldEvidence(jobId(selectedJob)).then((items) => {
        const photo = items.find((item) => item.mediaType === "image");
        if (!cancelled) setSelectedPhoto(photo?.dataUrl || null);
      }).catch(() => { if (!cancelled) setSelectedPhoto(null); });
    }
    return () => { cancelled = true; };
  }, [selectedJob]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize({ pan: false });
      const point = selectedJob && jobLatLng(selectedJob);
      if (point && !sheetExpanded) {
        map.panInside([point.lat, point.lng], { paddingTopLeft: [24, 24], paddingBottomRight: [60, Math.min(280, map.getSize().y * .6) + 20] });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedJob, sheetExpanded]);

  useEffect(() => {
    if (!selectedJob) return;
    refreshMediaCounts(selectedJob);
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
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  async function previewLocalRoute() {
    if (!mapRef.current || !pointsRef.current.length) return;
    const leafletModule = await import("leaflet");
    const L = (leafletModule as any).default || leafletModule;
    const center = userMarkerRef.current?.getLatLng?.() || mapRef.current.getCenter();
    const origin = { lat: Number(center.lat), lng: Number(center.lng) };
    const stops = pointsRef.current
      .filter(({ job }) => isPendingJob(job))
      .map((point) => ({ ...point, miles: distanceMiles(origin, { lat: point.lat, lng: point.lng }) }))
      .sort((a, b) => Math.max(0, jobPriority(b.job).days || 0) - Math.max(0, jobPriority(a.job).days || 0) || a.miles - b.miles)
      .slice(0, 6);

    if (!stops.length) return;
    if (routeLayerRef.current) routeLayerRef.current.remove();
    const routePoints = [origin, ...stops.map((point) => ({ lat: point.lat, lng: point.lng }))];
    const latLngs = routePoints.map((point) => [point.lat, point.lng]);
    routeLayerRef.current = L.featureGroup([
      L.polyline(latLngs, { color: "#020617", weight: 10, opacity: 0.72, lineCap: "round", lineJoin: "round" }),
      L.polyline(latLngs, { color: "#1d8cff", weight: 5, opacity: 0.94, dashArray: "12 10", lineCap: "round", lineJoin: "round" }),
    ]).addTo(mapRef.current);
    mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [42, 42], maxZoom: 14 });
    setRouteSummary({
      stops: stops.length,
      miles: routePoints.slice(1).reduce((sum, point, index) => sum + distanceMiles(routePoints[index], point), 0),
      firstStop: jobId(stops[0].job),
      href: googleRouteHref(routePoints),
    });
  }

  function mergeWorkflowPatchIntoScreen(id: string, patch: Record<string, unknown>) {
    setJobs((prev) => prev.map((row) => (jobId(row) === id ? { ...row, ...patch } : row)));
    setSelectedJob((prev) => (prev && jobId(prev) === id ? { ...prev, ...patch } : prev));
  }

  function workflowPatchForAction(
    key: "arrived" | "visit" | "work" | "status" | "complete",
    iso: string,
    statusLabel?: string
  ) {
    if (key === "arrived") {
      return {
        FieldArrivedAt: iso,
        fieldArrivedAt: iso,
        LastFieldVisitAt: iso,
        lastFieldVisitAt: iso,
        StatusOverride: "Arrived",
        status: "Arrived",
      };
    }
    if (key === "visit") {
      return {
        WorkflowStatus: "VISIT_STARTED",
        workflowStatus: "VISIT_STARTED",
        FieldOutcome: "VISIT_STARTED",
        fieldOutcome: "VISIT_STARTED",
        StatusOverride: "Visit Started",
        status: "Visit Started",
        VisitStartedAt: iso,
        visitStartedAt: iso,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }
    if (key === "work") {
      return {
        WorkflowStatus: "WORK_STARTED",
        workflowStatus: "WORK_STARTED",
        FieldOutcome: "WORK_STARTED",
        fieldOutcome: "WORK_STARTED",
        StatusOverride: "Work In Progress",
        status: "Work In Progress",
        JobStartedAt: iso,
        jobStartedAt: iso,
        ActualWorkStartDate: iso,
        actualWorkStartDate: iso,
        FieldTimerStartedAt: iso,
        fieldTimerStartedAt: iso,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }
    if (key === "complete") {
      return {
        WorkflowStatus: "WORK_COMPLETED",
        workflowStatus: "WORK_COMPLETED",
        FieldOutcome: "WORK_COMPLETED",
        fieldOutcome: "WORK_COMPLETED",
        StatusOverride: "Work Completed",
        status: "Work Completed",
        ActualWorkCompletionDate: iso,
        actualWorkCompletionDate: iso,
        JobFinishedAt: iso,
        jobFinishedAt: iso,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
        ArchivedFromMap: true,
      };
    }
    if (String(statusLabel || "").toLowerCase().includes("refused")) {
      return {
        WorkflowStatus: "REFUSED_ACCESS",
        workflowStatus: "REFUSED_ACCESS",
        FieldOutcome: "REFUSED_ACCESS",
        fieldOutcome: "REFUSED_ACCESS",
        StatusOverride: "Refused Access",
        status: "Refused Access",
        RefusalDate: iso,
        refusalDate: iso,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
        ArchivedFromMap: true,
      };
    }
    return {
      WorkflowStatus: "NO_ACCESS_1_WAITING_72H",
      workflowStatus: "NO_ACCESS_1_WAITING_72H",
      FieldOutcome: "NO_ACCESS_1_WAITING_72H",
      fieldOutcome: "NO_ACCESS_1_WAITING_72H",
      StatusOverride: "No Access 1st - Waiting 72h",
      status: "No Access 1st - Waiting 72h",
      NoAccessFirstAttemptAt: iso,
      noAccessFirstAttemptAt: iso,
      SecondAttemptAvailableAt: new Date(new Date(iso).getTime() + 72 * 60 * 60 * 1000).toISOString(),
      secondAttemptAvailableAt: new Date(new Date(iso).getTime() + 72 * 60 * 60 * 1000).toISOString(),
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
    };
  }

  function saveWorkflowStamp(job: JobRecord, key: "arrived" | "visit" | "work" | "status", statusLabel?: string) {
    const id = jobId(job);
    const now = new Date().toISOString();
    const patch = workflowPatchForAction(key, now, statusLabel);
    setWorkflowStamps((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: now,
        ...(statusLabel ? { status: statusLabel } : {}),
      },
    }));
    writeSharedWorkflowPatch(id, patch);
    mergeWorkflowPatchIntoScreen(id, patch);
  }

  async function refreshMediaCounts(job: JobRecord) {
    const id = jobId(job);
    const rows = await listFieldEvidence(id);
    setMediaCounts((prev) => ({
      ...prev,
      [id]: {
        before: rows.filter((media) => media.kind === "before").length,
        after: rows.filter((media) => media.kind === "after").length,
        total: rows.length,
      },
    }));
  }

  function requestMediaUpload(kind: FieldMediaKind) {
    pendingMediaKindRef.current = kind;
    mediaInputRef.current?.click();
  }

  async function handleMediaFiles(files: FileList | null) {
    if (!selectedJob || !files?.length) return;
    const kind = pendingMediaKindRef.current;
    const id = jobId(selectedJob);
    setMediaBusy(kind);
    setMediaMessage("");
    try {
      const saved = await saveFieldPhotos(id, kind, Array.from(files), {
        jobId: id,
        address: jobAddress(selectedJob),
        location: jobAddress(selectedJob),
        borough: String(jobBorough(selectedJob)),
        outcome: workflowStamps[id]?.status || jobStatus(selectedJob),
        label: kind === "before" ? "Before Work Evidence" : "After Work Evidence",
      });
      await refreshMediaCounts(selectedJob);
      setMediaMessage(saved.length ? `${kind === "before" ? "Before" : "After"} media saved: ${saved.length}` : "No image or video was saved.");
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : "Media save failed.");
    } finally {
      setMediaBusy("");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  }

  function beginClearWorkflow(job: JobRecord) {
    setClearJobId(jobId(job));
    setClearText("");
  }

  function clearWorkflow(job: JobRecord) {
    const id = jobId(job);
    if (clearText.trim().toUpperCase() !== "CLEAR") {
      setMediaMessage("Type CLEAR to reset this workflow.");
      return;
    }
    setWorkflowStamps((prev) => ({ ...prev, [id]: {} }));
    writeSharedWorkflowPatch(id, { __clearWorkflow: true });
    mergeWorkflowPatchIntoScreen(id, {
      WorkflowStatus: "",
      workflowStatus: "",
      FieldOutcome: "",
      fieldOutcome: "",
      StatusOverride: "",
      status: "Pending",
      FieldArrivedAt: "",
      fieldArrivedAt: "",
      LastFieldVisitAt: "",
      lastFieldVisitAt: "",
      VisitStartedAt: "",
      visitStartedAt: "",
      JobStartedAt: "",
      jobStartedAt: "",
      ActualWorkStartDate: "",
      actualWorkStartDate: "",
      OutcomeLockedAt: "",
      outcomeLockedAt: "",
    });
    setClearJobId("");
    setClearText("");
    setMediaMessage("Workflow cleared. Saved media stays unless you remove it from the media/package screen.");
  }

  function completeWorkForPackage(job: JobRecord) {
    const id = jobId(job);
    const now = new Date().toISOString();
    const patch = workflowPatchForAction("complete", now);
    setWorkflowStamps((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        work: prev[id]?.work || now,
        status: "Work Completed",
      },
    }));
    writeSharedWorkflowPatch(id, patch);
    mergeWorkflowPatchIntoScreen(id, patch);
  }

  function paperworkOutcome(stamps: { arrived?: string; visit?: string; work?: string; status?: string }) {
    const status = String(stamps.status || "").toLowerCase();
    if (status.includes("refused")) return "refused_access";
    if (status.includes("no access")) return "no_access";
    if (stamps.work) return "work_completed";
    return "work_completed";
  }

  function paperworkHref(job: JobRecord, media = true) {
    const id = jobId(job);
    const stamps = workflowStamps[id] || {};
    const outcome = paperworkOutcome(stamps);
    const params = new URLSearchParams({
      job: id,
      outcome,
      auto: "package",
      media: media ? "all" : "none",
      fieldStatus: outcome === "work_completed" ? "WORK_COMPLETED" : outcome === "refused_access" ? "REFUSED_ACCESS" : "NO_ACCESS_1_WAITING_72H",
    });
    if (stamps.arrived) params.set("arrivedAt", stamps.arrived);
    if (stamps.visit) params.set("visitStartedAt", stamps.visit);
    if (stamps.work) params.set("workStartedAt", stamps.work);
    if (outcome === "work_completed") params.set("workCompletedAt", new Date().toISOString());
    if (outcome === "refused_access") params.set("refusedAt", new Date().toISOString());
    if (outcome === "no_access") params.set("noAccessAt", new Date().toISOString());
    return `/paperwork?${params.toString()}`;
  }

  return (
    <main className={`fc-app fc-reference fc-full-map fc-clean-streets ${chromeOpen ? "fc-chrome-open" : ""} ${selectedJob ? "fc-has-job" : ""} ${controlsOpen ? "fc-controls-open" : ""} ${sheetExpanded ? "fc-sheet-expanded" : ""}`}>
      <button type="button" className="fc-reveal-controls" aria-label={chromeOpen ? "Hide all map controls" : "Show map controls"} title={chromeOpen ? "Hide controls" : "Map menu"} aria-expanded={chromeOpen} onClick={() => { setChromeOpen((open) => !open); setSelectedJob(null); }}><MenuIcon /></button>
      <div className="fc-search-row">
        <div className="fc-search-field">
          <SearchIcon />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address or job" aria-label="Search jobs" />
        </div>
        <button type="button" className={`fc-search-list-btn fc-tools-toggle ${controlsOpen ? "is-open" : ""}`} aria-label={controlsOpen ? "Hide map filters" : "Show map filters"} title="Map filters and navigation" aria-expanded={controlsOpen} aria-controls="field-map-filters" onClick={() => setControlsOpen((open) => !open)}>
          <ListIcon />
        </button>
      </div>
      <section id="field-map-filters" className="fc-control-drawer" aria-label="Map filters">
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <span className="fc-brand-icon">HPD</span>
            <div className="fc-brand-copy">
              <p className="fc-eyebrow">HPD Bid Dashboard 2026</p>
              <h1 className="fc-title">FIELD COMMAND</h1>
            </div>
          </div>
          <div className="fc-topbar-actions">
            <Link href="/alerts" className="fc-icon-btn" aria-label="Alerts">
              <BellIcon />
              {overdueCount > 0 ? <span className="fc-icon-badge">{overdueCount}</span> : null}
            </Link>
            <Link href="/more" className="fc-icon-btn" aria-label="More">
              <MenuIcon />
            </Link>
          </div>
        </div>
        <div className="fc-live-row">
          <div className="fc-live-copy">
            <span className="fc-live-dot">Loaded</span>
            <span className="fc-active-count">{activeJobs.length} Active Jobs</span>
          </div>
          <label className="fc-days-control">
            <span>Days</span>
            <select
              value={daysBack ?? ""}
              aria-label="Show jobs from last number of days"
              onChange={(event) => {
                const raw = event.target.value;
                setDaysBack(raw ? Number(raw) : null);
              }}
            >
              <option value="">Any</option>
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="90">90</option>
              <option value="180">180</option>
              <option value="365">365</option>
            </select>
          </label>
        </div>
      </header>

      <div className="fc-borough-row" role="group" aria-label="Borough filter">
        <button type="button" className={`fc-borough-chip ${borough === "ALL" ? "is-active" : ""}`} onClick={() => setBorough("ALL")}>
          <strong>All</strong>
          <span>{jobs.length}</span>
        </button>
        {BOROUGHS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`fc-borough-chip fc-${key.toLowerCase()} ${borough === key ? "is-active" : ""}`}
            onClick={() => setBorough(key)}
          >
            <strong>{label}</strong>
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
          <button
            type="button"
            className={`fc-map-fab fc-route-fab ${routeSummary ? "is-active" : ""}`}
            aria-label="Preview overdue stops"
            onClick={previewLocalRoute}
          >
            <RouteIcon />
          </button>
          <div className="fc-map-fab fc-visible-fab" aria-label="Visible jobs">
            <strong>{filteredJobs.length}</strong>
            <span>Visible Jobs</span>
          </div>
        </div>
        {routeSummary ? (
          <a className="fc-route-summary" href={routeSummary.href} target="_blank" rel="noreferrer">
            <strong>{routeSummary.stops} stops</strong>
            <span>{routeSummary.miles.toFixed(1)} mi estimated straight-line distance</span>
            <small>Stop preview, not driving directions</small>
            <small>First: {routeSummary.firstStop}</small>
          </a>
        ) : null}

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
          const counts = mediaCounts[id] || { before: 0, after: 0, total: 0 };
          return (
            <div className="fc-job-sheet fc-job-sheet-flow" aria-label="Selected job">
              <button type="button" className="fc-sheet-handle" aria-label={sheetExpanded ? "Collapse job details" : "Expand job details"} aria-expanded={sheetExpanded} onClick={() => setSheetExpanded((expanded) => !expanded)}><span /></button>
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
                <span className="fc-job-sheet-tag fc-age-tag" data-priority={jobPriority(selectedJob).band}>{jobPriority(selectedJob).label}</span>
              </div>
              <div className="fc-reference-job-summary">
                <dl>
                  <div><dt>Award date</dt><dd>{value(selectedJob, ["AwardDate", "awardDate"]) || "Not available"}</dd></div>
                  <div><dt>Maturity date</dt><dd>{maturityDate(selectedJob) || "Not available"}</dd></div>
                  <div><dt>COA amount</dt><dd>{jobAwardAmount(selectedJob) ? jobAwardAmount(selectedJob).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "Not available"}</dd></div>
                </dl>
                {selectedPhoto ? <img src={selectedPhoto} alt={`Saved job photo for ${id}`} /> : null}
              </div>
              <div className="fc-quick-actions">
                <a className="fc-quick-action is-navigate" href={directionsHref(selectedJob)} target="_blank" rel="noreferrer">
                  <NavigateIcon />
                  <span>Navigate</span>
                </a>
                {tenant.phone ? (
                  <a className="fc-quick-action is-call" href={`tel:${tenant.phone}`}>
                    <CallIcon />
                    <span>Call Tenant</span>
                  </a>
                ) : (
                  <span className="fc-quick-action is-call is-disabled">
                    <CallIcon />
                    <span>Call Tenant</span>
                  </span>
                )}
                <button type="button" className="fc-quick-action is-photos" onClick={() => requestMediaUpload("before")}>
                  <PhotosIcon />
                  <span>Photos</span>
                </button>
                <Link className="fc-quick-action is-documents" href={`/jobs/${id}`}>
                  <DocumentsIcon />
                  <span>Documents</span>
                </Link>
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
                <button type="button" className={`fc-workflow-btn ${stamps.arrived ? "is-saved" : ""}`} aria-label="Save arrival time" onClick={() => saveWorkflowStamp(selectedJob, "arrived")}>
                  <span>1</span>
                  <b>{stamps.arrived ? "Arrived Saved" : "Arrive"}</b>
                  <small>{stamps.arrived ? formatSavedTime(stamps.arrived) : "I am here"}</small>
                </button>
                <button type="button" className={`fc-workflow-btn ${stamps.visit ? "is-saved" : ""}`} aria-label="Start visit" onClick={() => saveWorkflowStamp(selectedJob, "visit")} disabled={!stamps.arrived}>
                  <span>2</span>
                  <b>{stamps.visit ? "Visit Started" : "Start Visit"}</b>
                  <small>{stamps.visit ? formatSavedTime(stamps.visit) : stamps.arrived ? "Begin visit" : "Arrive first"}</small>
                </button>
                <button type="button" className={`fc-workflow-btn ${stamps.work ? "is-saved" : ""}`} aria-label="Start work" onClick={() => saveWorkflowStamp(selectedJob, "work", "Work Started")} disabled={!stamps.visit}>
                  <span>3</span>
                  <b>{stamps.work ? "Work Started" : "Start Work"}</b>
                  <small>{stamps.work ? formatSavedTime(stamps.work) : "Before media next"}</small>
                </button>
                <button type="button" className="fc-workflow-btn no-access" aria-label="Save no access status" onClick={() => saveWorkflowStamp(selectedJob, "status", "No Access")} disabled={!stamps.visit}>
                  <span>4</span>
                  <b>No Access</b>
                  <small>Save attempt</small>
                </button>
                <button type="button" className="fc-workflow-btn refused" aria-label="Save refused status" onClick={() => saveWorkflowStamp(selectedJob, "status", "Refused")} disabled={!stamps.visit}>
                  <span>5</span>
                  <b>Refused</b>
                  <small>Close job</small>
                </button>
                <button type="button" className="fc-workflow-btn clear" aria-label="Clear field workflow" onClick={() => beginClearWorkflow(selectedJob)}>
                  <span>0</span>
                  <b>Clear</b>
                  <small>Type CLEAR</small>
                </button>
              </section>
              {clearJobId === id ? (
                <section className="fc-clear-confirm" aria-label="Confirm clear workflow">
                  <input
                    value={clearText}
                    onChange={(event) => setClearText(event.target.value)}
                    placeholder="Type CLEAR"
                    autoCapitalize="characters"
                  />
                  <button type="button" onClick={() => clearWorkflow(selectedJob)} disabled={clearText.trim().toUpperCase() !== "CLEAR"}>
                    Reset
                  </button>
                  <button type="button" onClick={() => setClearJobId("")}>
                    Keep
                  </button>
                </section>
              ) : null}
              <section className="fc-media-package-panel" aria-label="Media and package">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  capture="environment"
                  className="fc-hidden-file"
                  onChange={(event) => void handleMediaFiles(event.target.files)}
                />
                <div className="fc-media-head">
                  <strong>Media + Package</strong>
                  <span>{counts.total} saved</span>
                </div>
                <div className="fc-media-grid">
                  <button type="button" onClick={() => requestMediaUpload("before")} disabled={!stamps.work || Boolean(mediaBusy)}>
                    <b>Before</b>
                    <small>{mediaBusy === "before" ? "Saving..." : `${counts.before} saved`}</small>
                  </button>
                  <button type="button" onClick={() => requestMediaUpload("after")} disabled={!stamps.work || Boolean(mediaBusy)}>
                    <b>After</b>
                    <small>{mediaBusy === "after" ? "Saving..." : `${counts.after} saved`}</small>
                  </button>
                  <a href={paperworkHref(selectedJob, true)} onClick={() => completeWorkForPackage(selectedJob)}>
                    <b>Package</b>
                    <small>PDF + media</small>
                  </a>
                  <a href={paperworkHref(selectedJob, false)} onClick={() => completeWorkForPackage(selectedJob)}>
                    <b>No Media</b>
                    <small>PDF only</small>
                  </a>
                </div>
                <p>{mediaMessage || "Media is saved on this device and read by the paperwork package screen."}</p>
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
