"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FieldTabBar from "../../components/FieldTabBar";
import { jobPriority, maturityDate, isPendingJob, matchesMapStatus, matchesAwardLookback } from "../../lib/job-priority";
import { fieldStatusLabel } from "../../lib/field-status";
import { nextFieldAction, paperworkReviewHref, FIELD_OUTCOMES, fieldOutcomePatch, arrivalVisitPatch, suggestedPhotoKind } from "../../lib/field-next-action";
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
  { key: "pending", label: "Pending" },
  { key: "closed", label: "Handled" },
  { key: "all", label: "All jobs" },
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
  const specific = fieldStatusLabel(jobStatus(job));
  if (specific) return specific;
  const s = jobStatus(job).toLowerCase().replace(/_/g, " ");
  return STATUS_META.find((meta) => meta.match(s, job)) || STATUS_META[STATUS_META.length - 1];
}

function statusMarkerHtml(color: string, iconKey: StatusKey) {
  return `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.45);display:grid;place-items:center;"><svg width="15" height="15" viewBox="0 0 24 24">${STATUS_ICON_PATHS[iconKey]}</svg></div>`;
}

function ageMarkerHtml(days: number | null, pending: boolean) {
  const label = !pending ? "Done" : days === null ? "?" : days === 0 ? "Due" : days < 0 ? `+${-days}` : String(days);
  const overdue = days !== null && days > 30;
  const fill = !pending || days === null ? "#64717d" : overdue ? "#c73843" : "#007aff";
  return `<div class="fc-work-pin" style="--pin-color:${fill}"><svg viewBox="0 0 24 24" aria-hidden="true">${HARDHAT_ICON_PATH.replaceAll("#fff", "#ffda70")}</svg><span>${label}${days !== null && days > 0 && pending ? "d" : ""}</span></div>`;
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
  const s = jobStatus(job).toLowerCase().replace(/_/g, " ");
  if (s.includes("partial") || s.includes("progress")) return "open";
  if (s.includes("appointment")) return "pending";
  if (s.includes("no access") || s.includes("refused")) return "closed";
  if (s.includes("complet")) return "closed";
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
  const jobSheetRef = useRef<HTMLDivElement | null>(null);
  const outcomePanelRef = useRef<HTMLElement | null>(null);
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, { outcome: string; note: string }>>({});
  const [outcomeMessage, setOutcomeMessage] = useState("");
  const mapRef = useRef<any>(null);
  const mapFramingRef = useRef("");
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
  const [status, setStatus] = useState("pending");
  const requestedJobLoaded = useRef(false);
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [customDateRange, setCustomDateRange] = useState(false);
  const [dateFilterLoaded, setDateFilterLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hpd-map-award-days");
      if (saved !== null && /^\d+$/.test(saved) && Number(saved) <= 3650) {
        setDaysBack(Number(saved));
        setCustomDateRange(![30,90,180,365].includes(Number(saved)));
      }
    } catch { /* Map filtering remains available without device storage. */ }
    setDateFilterLoaded(true);
  }, []);
  useEffect(() => {
    if (!dateFilterLoaded) return;
    try {
      if (daysBack === null) localStorage.removeItem("hpd-map-award-days");
      else localStorage.setItem("hpd-map-award-days", String(daysBack));
    } catch { /* Keep the current filter when storage is unavailable. */ }
  }, [daysBack, dateFilterLoaded]);
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
  const [workflowLoaded, setWorkflowLoaded] = useState(false);
  const [mediaCounts, setMediaCounts] = useState<Record<string, { before: number; after: number; total: number }>>({});
  const [mediaBusy, setMediaBusy] = useState("");
  const [mediaMessage, setMediaMessage] = useState("");
  const [clearJobId, setClearJobId] = useState("");
  const [clearText, setClearText] = useState("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const mediaChoiceRef = useRef<HTMLDivElement | null>(null);
  const [mediaChoice, setMediaChoice] = useState<FieldMediaKind | null>(null);
  const pendingMediaKindRef = useRef<FieldMediaKind>("before");

  useEffect(() => { setMediaChoice(null); }, [selectedJob ? jobId(selectedJob) : ""]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    function refreshJobs() {
      if (loading) return;
      loading = true;
      fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("Job refresh failed"); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : data.jobs || data.data || data.records;
        if (!Array.isArray(rows)) throw new Error("Invalid job response");
        const overrides = readSharedWorkflowOverrides();
        const next = rows.map((row: JobRecord) => ({ ...row, ...(overrides[jobId(row)] || {}) }));
        setJobs((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      })
      .catch(() => { /* Keep the last loaded jobs if refresh is unavailable. */ })
      .finally(() => { loading = false; });
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === SHARED_WORKFLOW_STORAGE_KEY) refreshJobs();
    };
    refreshJobs();
    window.addEventListener("focus", refreshJobs);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(refreshJobs, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshJobs);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FIELD_WORKFLOW_STORAGE_KEY);
      if (saved) setWorkflowStamps(JSON.parse(saved));
      const drafts = window.localStorage.getItem("hpd-field-visit-drafts");
      if (drafts) setOutcomeDrafts(JSON.parse(drafts));
    } catch {}
    setWorkflowLoaded(true);
  }, []);

  useEffect(() => {
    if (!workflowLoaded) return;
    try {
      window.localStorage.setItem(FIELD_WORKFLOW_STORAGE_KEY, JSON.stringify(workflowStamps));
    } catch {}
  }, [workflowStamps, workflowLoaded]);

  useEffect(() => {
    if (!workflowLoaded) return;
    try { window.localStorage.setItem("hpd-field-visit-drafts", JSON.stringify(outcomeDrafts)); }
    catch { setOutcomeMessage("Draft could not be saved on this device. Keep this screen open."); }
  }, [outcomeDrafts, workflowLoaded]);

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
    return jobs.filter((job) => {
      if (!matchesMapStatus(job, status)) return false;
      if (!matchesAwardLookback(job, daysBack)) return false;
      if (borough !== "ALL" && jobBorough(job) !== borough) return false;
      if (q) {
        const haystack = [jobId(job), jobAddress(job), jobBorough(job), jobStatus(job)].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, borough, status, search, daysBack]);

  useEffect(() => {
    if (!jobs.length || requestedJobLoaded.current) return;
    requestedJobLoaded.current = true;
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("omo") || params.get("job") || params.get("q") || "").trim().toUpperCase();
    if (!requested || selectedJob) return;
    const match = jobs.find((job) => jobId(job).toUpperCase() === requested);
    if (match) {
      setSelectedJob(match);
      if (isPendingJob(match)) setSearch(requested);
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
    const counts: Record<string, number> = { closed: 0, pending: 0 };
    jobs.forEach((job) => {
      const g = isPendingJob(job) ? "pending" : "closed";
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
                if (layer.type === "symbol" && layer["source-layer"] === "poi") gl.setLayoutProperty(layer.id, "visibility", "none");
                if (layer.type === "background") gl.setPaintProperty(layer.id, "background-color", "#cbd9cc");
                if (layer.type === "fill") {
                  const colors: Record<string, string> = {
                    water: "#78b6bd", landuse_residential: "#c6d6c7", building: "#a6bba9",
                    park: "#91b887", landcover_wood: "#7da774", landcover_grass: "#a4c397",
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
              if (!darkTilesRef.current) tileLayerRef.current?.remove();
              map.attributionControl.addAttribution('<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>');
            });
            gl.on("error", (event: { error?: Error }) => {
              console.warn("Clean Streets map unavailable; using street-map fallback.", event.error?.message);
              // A failed style or tile must not leave an empty map above the fallback.
              if (mapRef.current === map && vectorLayerRef.current === vector) {
                vector.getContainer().style.opacity = "0";
                vector.getContainer().dataset.ready = "false";
                tileLayerRef.current?.addTo(map);
              }
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

        // Panning translates every point equally, so cluster membership changes only on zoom/data updates.
        map.on("zoomend", () => renderMarkersRef.current());

      }

      const map = mapRef.current;

      const framing = `${borough}|${search}|${status}|${daysBack}`;
      if (mapFramingRef.current !== framing && points.length) {
        mapFramingRef.current = framing;
        if (points.length === 1) {
          map.setView([points[0].lat, points[0].lng], 15);
        } else if (points.length > 1 && borough === "ALL" && !search.trim()) {
          // Keep the initial city view useful even when a record lies far outside NYC.
          map.setView([40.72, -73.95], 11);
        } else if (points.length > 1) {
          const bounds = points.map((p) => [p.lat, p.lng]) as [number, number][];
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
      }
      renderMarkersRef.current();
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [filteredJobs, borough, search, status, daysBack]);

  useEffect(() => {
    darkTilesRef.current = darkTiles;
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.options.maxNativeZoom = darkTiles ? 16 : 19;
    tileLayerRef.current.setUrl(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL);
    const container = vectorLayerRef.current?.getContainer();
    const useVector = !darkTiles && container?.dataset.ready === "true";
    if (container) container.style.opacity = useVector ? "1" : "0";
    if (useVector) tileLayerRef.current.remove();
    else tileLayerRef.current.addTo(mapRef.current);
  }, [darkTiles]);

  useEffect(() => () => {
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
  }, [borough, status, search, daysBack, jobs]);

  useEffect(() => {
    if (selectedJob) {
      const match = jobs.find((job) => jobId(job) === jobId(selectedJob));
      if (!match) setSelectedJob(null);
      else if (match !== selectedJob) setSelectedJob(match);
    }
  }, [jobs, selectedJob]);

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
        map.panInside([point.lat, point.lng], { paddingTopLeft: [24, 24], paddingBottomRight: [60, (jobSheetRef.current?.offsetHeight || 280) + 20] });
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
      return arrivalVisitPatch(iso);
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
        PackageReviewStatus: "Pending",
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
        PackageReviewStatus: "Pending",
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
    try { writeSharedWorkflowPatch(id, patch); }
    catch {
      setOutcomeMessage("Could not save this step on this device. Please retry.");
      return;
    }
    setWorkflowStamps((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: now,
        ...(key === "arrived" ? { visit: now } : {}),
        ...(statusLabel ? { status: statusLabel } : {}),
      },
    }));
    mergeWorkflowPatchIntoScreen(id, patch);
  }

  function openOutcomePanel() {
    setSheetExpanded(true);
    requestAnimationFrame(() => outcomePanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function chooseOutcome(outcome: string) {
    if (!selectedJob) return;
    const id = jobId(selectedJob);
    setOutcomeDrafts((prev) => ({ ...prev, [id]: { note: prev[id]?.note || "", outcome } }));
    openOutcomePanel();
  }

  function saveVisitOutcome(job: JobRecord, review = false) {
    const id = jobId(job);
    const draft = outcomeDrafts[id] || { outcome: "", note: "" };
    try {
      const patch = fieldOutcomePatch(job, draft.outcome, draft.note, new Date().toISOString());
      writeSharedWorkflowPatch(id, patch);
      mergeWorkflowPatchIntoScreen(id, patch);
      if (draft.outcome) setWorkflowStamps((prev) => ({ ...prev, [id]: { ...prev[id], status: FIELD_OUTCOMES[draft.outcome] } }));
      setOutcomeDrafts((prev) => ({ ...prev, [id]: { outcome: "", note: "" } }));
      setOutcomeMessage("Saved on this device. Not archived or emailed.");
      if (review) window.location.assign(paperworkReviewHref(id));
    } catch (error) {
      setOutcomeMessage(error instanceof Error ? error.message : "Save failed. Your draft is still here.");
    }
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
    setMediaChoice(kind);
    requestAnimationFrame(() => mediaChoiceRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  function chooseMediaSource(source: "camera" | "library") {
    if (!mediaChoice || mediaBusy) return;
    const kind = mediaChoice;
    pendingMediaKindRef.current = kind;
    if (source === "camera") cameraInputRef.current?.click();
    else mediaInputRef.current?.click();
    setMediaChoice(null);
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
      if (cameraInputRef.current) cameraInputRef.current.value = "";
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

        <div className="fc-award-filter">
          <div className="fc-date-custom">
          <label htmlFor="award-range">Awarded</label>
          <select id="award-range" aria-label="Award date range" value={customDateRange || (daysBack !== null && ![30,90,180,365].includes(daysBack)) ? "custom" : daysBack ?? "all"} onChange={(event) => {
            const selected = event.target.value;
            setCustomDateRange(selected === "custom");
            if (selected !== "custom") setDaysBack(selected === "all" ? null : Number(selected));
          }}>
            <option value="all">All dates</option>
            {[30,90,180,365].map((days) => <option key={days} value={days}>Last {days} days</option>)}
            <option value="custom">Custom</option>
          </select>
          {customDateRange || (daysBack !== null && ![30,90,180,365].includes(daysBack)) ? <input id="award-lookback" aria-label="Custom days back" title="Days back" type="number" inputMode="numeric" min="0" max="3650" step="1" placeholder="Days" value={daysBack ?? ""} onChange={(event) => {
            const raw = event.target.value;
            if (!raw) setDaysBack(null);
            else if (event.target.validity.valid) setDaysBack(Number(raw));
          }} /> : null}
          <output aria-live="polite">{filteredJobs.length ? `${filteredJobs.length} jobs` : "No matches"}</output>
          </div>
        </div>
        <div className="fc-pill-row fc-status-pill-row" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`fc-pill ${status === key ? "is-active" : ""}`}
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              <strong>{label}</strong>
              <span>{key === "all" ? jobs.length : statusCounts[key] || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="fc-map-wrap">
        {daysBack !== null && !(controlsOpen && chromeOpen) ? <button className="fc-active-date" type="button" onClick={() => { setChromeOpen(true); setControlsOpen(true); }}>Awarded: {daysBack} days</button> : null}
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
          const next = nextFieldAction(stamps, counts, jobStatus(selectedJob));
          const draft = outcomeDrafts[id] || { outcome: "", note: "" };
          return (
            <div ref={jobSheetRef} className="fc-job-sheet fc-job-sheet-flow" aria-label="Selected job">
              <button type="button" className="fc-sheet-handle" aria-label={sheetExpanded ? "Collapse job details" : "Expand job details"} aria-expanded={sheetExpanded} onClick={() => setSheetExpanded((expanded) => !expanded)}><span /></button>
              <button type="button" className="fc-job-sheet-close" aria-label="Close" title="Close job details" onClick={() => setSelectedJob(null)}>
                <span aria-hidden="true">&times;</span>
              </button>
              <div className="fc-job-sheet-hero">
                <strong className="fc-job-sheet-id">{id}</strong>
                <span className="fc-card-borough">{BOROUGHS.find((item) => item.key === jobBorough(selectedJob))?.label || "NYC"}</span>
              </div>
              <div className="fc-address-row">
                <p>{jobAddress(selectedJob)}</p>
                <a className="fc-route-btn fc-route-waze" href={wazeHref(selectedJob)} target="_blank" rel="noreferrer">Waze</a>
                <a className="fc-route-btn fc-route-google" href={directionsHref(selectedJob)} target="_blank" rel="noreferrer">Google</a>
              </div>
              <div className="fc-job-sheet-tags">
                <span className="fc-job-sheet-tag fc-job-status">
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
                    <span>Call</span>
                  </a>
                ) : (
                  <span className="fc-quick-action is-call is-disabled" aria-label="Tenant phone unavailable" title="No tenant phone on file">
                    <CallIcon />
                    <span>No phone</span>
                  </span>
                )}
                <button type="button" className="fc-quick-action is-photos" aria-label={`Add ${suggestedPhotoKind(stamps)} photos`} onClick={() => requestMediaUpload(suggestedPhotoKind(stamps))}>
                  <PhotosIcon />
                  <span>{suggestedPhotoKind(stamps) === "after" ? "After photos" : "Before photos"}</span>
                </button>
                <Link className="fc-quick-action is-documents" href={`/jobs/${id}`}>
                  <DocumentsIcon />
                  <span>Documents</span>
                </Link>
              </div>
              <div className="fc-next-step">
                {mediaChoice ? <div ref={mediaChoiceRef} className="fc-photo-choice" role="group" aria-label={`${mediaChoice} photo source`}>
                  <div className="fc-photo-choice-heading"><strong>{mediaChoice === "before" ? "Before work" : "After work"}</strong><button type="button" aria-label="Cancel photo selection" onClick={() => setMediaChoice(null)}>&times;</button></div>
                  <div className="fc-photo-source-actions">
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("camera")}><PhotosIcon />Take {mediaChoice} photo</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("library")}><DocumentsIcon />Add {mediaChoice} photos</button>
                  </div>
                </div> : null}
                {next.key === "review" ? (
                  <a href={paperworkReviewHref(id)} className="fc-next-action">{next.label}<span aria-hidden="true">&rarr;</span></a>
                ) : next.key === "record" ? (
                  <button type="button" className="fc-next-action" onClick={openOutcomePanel}>{next.label}<span aria-hidden="true">&rarr;</span></button>
                ) : (
                  <button type="button" className="fc-next-action" disabled={!workflowLoaded || Boolean(mediaBusy)} onClick={() => {
                    if (next.key === "before" || next.key === "after") requestMediaUpload(next.key);
                    else saveWorkflowStamp(selectedJob, next.key, next.key === "work" ? "Work Started" : undefined);
                  }}>{mediaBusy ? "Saving media..." : next.label}<span aria-hidden="true">&rarr;</span></button>
                )}
                {outcomeMessage ? <p className="fc-save-message" role="status">{outcomeMessage}</p> : null}
              </div>
              <div className="fc-card-footer">
              <button type="button" className="fc-outcome-link" onClick={openOutcomePanel}>Outcome / note</button>
              <button type="button" className="fc-job-details-toggle" aria-expanded={sheetExpanded} onClick={() => setSheetExpanded((expanded) => !expanded)}>{sheetExpanded ? "Less detail" : "Job details"}<span aria-hidden="true">{sheetExpanded ? "\u2304" : "\u2303"}</span></button>
              </div>
              <section ref={outcomePanelRef} className="fc-outcome-panel" aria-label="Visit outcome">
                <label>Outcome<select value={draft.outcome} onChange={(event) => setOutcomeDrafts((prev) => ({ ...prev, [id]: { ...draft, outcome: event.target.value } }))}><option value="">Select outcome</option>{Object.entries(FIELD_OUTCOMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>Visit note<textarea value={draft.note} rows={3} onChange={(event) => setOutcomeDrafts((prev) => ({ ...prev, [id]: { ...draft, note: event.target.value } }))} /></label>
                <button type="button" className="fc-next-action" onClick={() => saveVisitOutcome(selectedJob)} disabled={!draft.outcome && !draft.note.trim()}>Save visit record</button>
                {draft.outcome && draft.outcome !== "APPOINTMENT_REQUESTED" ? <button type="button" className="fc-save-review" onClick={() => saveVisitOutcome(selectedJob, true)}>Save &amp; review paperwork <span aria-hidden="true">&rarr;</span></button> : null}
                <p role="status">{outcomeMessage || "Device storage only. Appointment requests are not confirmed bookings."}</p>
                {Array.isArray(selectedJob.FieldVisitHistory) && selectedJob.FieldVisitHistory.length > 0 ? <details className="fc-visit-history"><summary>Visit history ({selectedJob.FieldVisitHistory.length})</summary><ol>{selectedJob.FieldVisitHistory.map((entry: { recordedAt?: string; outcome?: string; note?: string }, index: number) => <li key={index}><time>{entry.recordedAt ? formatSavedTime(entry.recordedAt) : "Date not recorded"}</time><strong>{FIELD_OUTCOMES[entry.outcome || ""] || "Visit note"}</strong><p>{entry.note}</p></li>)}</ol></details> : null}
              </section>
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
                <button type="button" className="fc-workflow-btn no-access" aria-label="Record no access" onClick={() => chooseOutcome("NO_ACCESS_1_WAITING_72H")}>
                  <span>4</span>
                  <b>No Access</b>
                  <small>Save attempt</small>
                </button>
                <button type="button" className="fc-workflow-btn refused" aria-label="Record refused access" onClick={() => chooseOutcome("REFUSED_ACCESS")}>
                  <span>5</span>
                  <b>Refused</b>
                  <small>Record refusal</small>
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
                  className="fc-hidden-file"
                  onChange={(event) => void handleMediaFiles(event.target.files)}
                />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
                <div className="fc-media-head">
                  <strong>Media + Package</strong>
                  <span>{counts.total} saved</span>
                </div>
                <div className="fc-media-grid">
                  <button type="button" onClick={() => requestMediaUpload("before")} disabled={Boolean(mediaBusy)}>
                    <b>Before</b>
                    <small>{mediaBusy === "before" ? "Saving..." : `${counts.before} saved`}</small>
                  </button>
                  <button type="button" onClick={() => requestMediaUpload("after")} disabled={Boolean(mediaBusy)}>
                    <b>After</b>
                    <small>{mediaBusy === "after" ? "Saving..." : `${counts.after} saved`}</small>
                  </button>
                  <a href={paperworkReviewHref(id, true)}>
                    <b>Review package</b>
                    <small>Affidavit + invoice</small>
                  </a>
                  <a href={paperworkReviewHref(id, false)}>
                    <b>Review documents</b>
                    <small>Without media</small>
                  </a>
                </div>
                <p>{mediaMessage || "Media is saved on this device and read by the paperwork package screen."}</p>
              </section>
            </div>
          );
        })() : null}
      </div>

      <PlanMyDayDrawer records={jobs} />
      <FieldTabBar />
    </main>
  );
}
