"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AppointmentEditor from "./AppointmentEditor";
import TodayRoute from "./TodayRoute";
import BuildingPhoto from "./BuildingPhoto";
import type { RouteJob, RoutePoint } from "../../lib/day-route";
import { CURRENT_JOB_KEY, parseCurrentJob, type CurrentJob } from "../../lib/current-job";
import { appointmentPatch, nyToday, type Appointment } from "../../lib/appointments";
import { jobPriority, maturityDate, isPendingJob, matchesAwardLookback, JOB_DATE_FIELDS, JobDateField, jobDate, matchesJobDateRange, calendarDay, jobDateWarning, currentYearRange } from "../../lib/job-priority";
import { fieldStatusLabel } from "../../lib/field-status";
import { JOB_QUEUES, jobQueue, matchesJobQueue, visitState } from "../../lib/job-queue";
import { nextFieldAction, paperworkNextHref, paperworkGenerateHref, FIELD_OUTCOMES, fieldOutcomePatch, arrivalVisitPatch } from "../../lib/field-next-action";
import { canReadAloud, readAloud, stopReading } from "../../lib/read-aloud";
import { fetchServerWorkflowOverrides, HPD_STATUS_WORKER_URL } from "../../lib/paperwork";
import { longestCleanDescription } from "../../lib/description-quality";
import { listFieldEvidence, saveFieldPhotos, type FieldMediaKind } from "../../lib/field-photo-store";
import PlanMyDayDrawer from "../map/PlanMyDayDrawer";
import "../map/plan-my-day.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./job-card-v2.css";

type JobRecord = Record<string, unknown>;

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

const FIELD_WORKFLOW_STORAGE_KEY = "hpd-field-command-workflow";
const SHARED_WORKFLOW_STORAGE_KEY = "hpd-job-workflow-overrides-v2";

const BOROUGHS: { key: BoroughKey; label: string; center: [number, number]; color: string }[] = [
  { key: "MN", label: "Manhattan", center: [40.7831, -73.9712], color: "#2dd4bf" },
  { key: "BK", label: "Brooklyn", center: [40.6782, -73.9442], color: "#ff9f0a" },
  { key: "QN", label: "Queens", center: [40.7282, -73.7949], color: "#bf5af2" },
  { key: "BX", label: "Bronx", center: [40.8448, -73.8648], color: "#ff453a" },
  { key: "SI", label: "Staten Is.", center: [40.5795, -74.1502], color: "#30d158" },
];

const STATUS_FILTERS = JOB_QUEUES;

// Borough bar icons (one tap each).
const BOROUGH_ICONS: Record<BoroughKey, string> = { MN: "🏙️", BK: "🌉", QN: "👑", BX: "⚾", SI: "⛴️" };

// One-tap date windows for the quick filters, on whichever date type is picked.
const QUICK_DATE_RANGES = [
  { key: "year", label: "This year" },
  { key: "next30", label: "Next 30 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "last60", label: "Last 60 days" },
  { key: "last90", label: "Last 90 days" },
  { key: "all", label: "All dates" },
] as const;
type QuickDateKey = (typeof QUICK_DATE_RANGES)[number]["key"];

function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function quickDateBounds(key: QuickDateKey, today: string) {
  if (key === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  if (key === "next30") return { from: today, to: shiftDay(today, 30) };
  if (key === "last30") return { from: shiftDay(today, -30), to: today };
  if (key === "last60") return { from: shiftDay(today, -60), to: today };
  if (key === "last90") return { from: shiftDay(today, -90), to: today };
  return { from: "", to: "" };
}

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

const JOBS_URL = "/data/COA_Fetcher_2026.json";
// Where the map was last left (center + zoom), so it reopens right there.
const MAP_VIEW_KEY = "hpd-map-view-v1";

function savedMapView(): { lat: number; lng: number; zoom: number } | null {
  try {
    const view = JSON.parse(localStorage.getItem(MAP_VIEW_KEY) || "null");
    return view && [view.lat, view.lng, view.zoom].every((n) => typeof n === "number" && Number.isFinite(n)) ? view : null;
  } catch {
    return null;
  }
}
const JOBS_CACHE = "hpd-jobs-v1";

function jobId(job: JobRecord) {
  return value(job, ["OMO", "omo", "OMONumber", "id", "Id"]) || "HPD JOB";
}

function jobAddress(job: JobRecord) {
  return value(job, ["BuildingAddress", "Address", "address", "Location", "location"]) || "Address not captured";
}

// Shown when the ITB's scope couldn't be read (e.g. a scanned ITB with only the blank form's text).
const SCOPE_MISSING = "Couldn't read the scope from this job's ITB. Open the ITB under Job documents; type the scope on the paperwork page.";

function jobScope(job: JobRecord) {
  const picked = longestCleanDescription(job, [
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
    .trim();
  return picked || SCOPE_MISSING;
}

function packageStatusText(job: JobRecord) {
  const status = value(job, ["PackageReviewStatus", "packageReviewStatus"]);
  const message = value(job, ["PackageReadyMessage", "packageReadyMessage"]);
  if (/approved/i.test(status)) return message || "Approved";
  if (status) return "Draft ready - review and approve";
  return "Review and generate the package";
}

function tenantInfo(job: JobRecord) {
  const apt = value(job, ["ItbTenantApartment", "ApartmentUnit", "Apartment", "Apt", "apt"]);
  const name = value(job, ["ItbTenantName", "TenantName", "tenantName", "Tenant", "tenant"]);
  const phone = value(job, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "Phone", "phone"]);
  const accessType = value(job, ["ItbTenantAccessType", "TenantAccessType"]);
  const status = value(job, ["ItbTenantContactStatus", "TenantContactStatus"]);
  const commonArea = accessType.toLowerCase().includes("common") || status.toLowerCase().includes("common");
  const cleanName = !commonArea && name && name.toUpperCase() !== "T" ? name : "";
  return {
    apt,
    name: cleanName,
    phone,
    commonArea,
    label: commonArea ? "Public area" : "Tenant contact",
    summary: commonArea
      ? "No tenant appointment needed"
      : [apt ? `Apt ${apt}` : "", cleanName, phone || "Request contact from HPD"]
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

type StatusKey = "complete" | "noaccess" | "refused" | "pending" | "awarded" | "open" | "appointment" | "done";

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
  appointment: '<rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="white" stroke-width="2"/><path d="M8 3v5M16 3v5M4 10h16" fill="none" stroke="white" stroke-width="2"/>',
  // Completed job: a check mark, so it's clear at a glance there's nothing left to do there.
  done: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
};

const DONE_COLOR = "#16a34a";

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
  { key: "open", label: "Pending", color: "#0a84ff", match: () => true },
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

function ageMarkerHtml(days: number | null, pending: boolean, zoom = 16, multiple = false, color = "#0a84ff", icon: StatusKey = "pending") {
  const label = !pending ? "" : days === null ? "?" : days === 0 ? "0" : days < 0 ? `+${-days}` : String(days);
  const symbol = pending && icon === "awarded" ? HARDHAT_ICON_PATH : STATUS_ICON_PATHS[icon];
  return `<div class="fc-day-pin ${icon === "appointment" ? "is-appointment" : ""} ${multiple ? "has-more" : ""} ${zoom < 14 || label.length > 3 ? "is-distant" : ""}" style="--pin-color:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${symbol}</svg>${pending ? `<strong>${label}<small>d</small></strong>` : ""}</div>`;
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
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving&dir_action=navigate`;
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
  // The job card is internal, so it keeps the time. Anything that goes out (PDFs, email, Drive
  // file names) shows the date only.
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

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M15 9.5c0-1.4-1.34-2.5-3-2.5s-3 1.1-3 2.5 1.34 2.5 3 2.5 3 1.1 3 2.5-1.34 2.5-3 2.5-3-1.1-3-2.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}


const LIGHT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const DARK_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

function individualPinOffset(index: number, count: number) {
  const columns = Math.min(3, count);
  const rows = Math.ceil(count / columns);
  return { x: ((index % columns) - (columns - 1) / 2) * 62, y: (Math.floor(index / columns) - (rows - 1) / 2) * 48 };
}

function reservePinLabel(x: number, y: number, occupied: { x: number; y: number }[]) {
  if (occupied.some(p => Math.abs(p.x - x) < 58 && Math.abs(p.y - y) < 44)) return false;
  occupied.push({ x, y });
  return true;
}

function groupByLocation(
  points: { job: JobRecord; lng: number; lat: number }[],
) {
  const locations = new Map<string, { lng: number; lat: number; jobs: JobRecord[] }>();
  for (const point of points) {
    const key = `${point.lat}|${point.lng}`;
    const existing = locations.get(key);
    if (existing) existing.jobs.push(point.job);
    else locations.set(key, { lat: point.lat, lng: point.lng, jobs: [point.job] });
  }
  return [...locations.values()];
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

export default function FieldCommandClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const jobSheetRef = useRef<HTMLDivElement | null>(null);
  const sheetTouchStart = useRef<number | null>(null);
  const outcomePanelRef = useRef<HTMLElement | null>(null);
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, { outcome: string; note: string }>>({});
  const [outcomeMessage, setOutcomeMessage] = useState("");
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const appointmentRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapFramingRef = useRef("");
  const restoredMapViewRef = useRef(false);
  const tileLayerRef = useRef<any>(null);
  const vectorLayerRef = useRef<any>(null);
  const darkTilesRef = useRef(false);
  const layerGroupRef = useRef<any>(null);
  const boroughLabelLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const dayRouteLayerRef = useRef<any>(null);
  const dayRouteRequest = useRef(0);
  const [routeMapReady, setRouteMapReady] = useState(false);
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const pointsRef = useRef<{ job: JobRecord; lng: number; lat: number }[]>([]);
  const renderMarkersRef = useRef<() => void>(() => {});
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [calendarDate, setCalendarDate] = useState(nyToday);

  useEffect(() => {
    const refreshDate = () => setCalendarDate(nyToday());
    const timer = window.setInterval(refreshDate, 30000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState("pending");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Status and borough filters come back as they were left.
  const quickFiltersLoaded = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hpd-map-quick-filters-v1") || "null");
      if (saved && STATUS_FILTERS.some(({ key }) => key === saved.status)) setStatus(saved.status);
      if (saved && (saved.borough === "ALL" || BOROUGHS.some(({ key }) => key === saved.borough))) setBorough(saved.borough);
    } catch {}
    quickFiltersLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!quickFiltersLoaded.current) return;
    try { localStorage.setItem("hpd-map-quick-filters-v1", JSON.stringify({ status, borough })); } catch {}
  }, [status, borough]);
  const requestedJobLoaded = useRef(false);
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{ field: JobDateField; from: string; to: string; preset?: boolean }>(currentYearRange);
  useEffect(() => { setDateRange(previous => previous.preset ? currentYearRange() : previous); }, [calendarDate]);
  const [customDateRange, setCustomDateRange] = useState(false);
  const [dateFilterLoaded, setDateFilterLoaded] = useState(false);
  useEffect(() => {
    try {
      const range = JSON.parse(localStorage.getItem("hpd-map-date-range-v2") || "null");
      if (range && Object.hasOwn(JOB_DATE_FIELDS, range.field) && typeof range.from === "string" && typeof range.to === "string"
        && (!range.from || calendarDay(range.from) !== null) && (!range.to || calendarDay(range.to) !== null)) setDateRange(range.preset ? currentYearRange() : range);
      const saved = range ? localStorage.getItem("hpd-map-award-days") : null;
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
  useEffect(() => {
    if (!dateFilterLoaded) return;
    try { localStorage.setItem("hpd-map-date-range-v2", JSON.stringify(dateRange)); } catch { /* Filtering still works without storage. */ }
  }, [dateRange, dateFilterLoaded]);
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [currentJob,setCurrentJob] = useState<CurrentJob|null>(null);
  const currentJobRef=useRef<CurrentJob|null>(null);
  const resumeInitialized=useRef(false);
  const navigationDeparted=useRef(false);
  const [darkTiles, setDarkTiles] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  const [plannerRequest,setPlannerRequest] = useState(0);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => { setSpeechOk(canReadAloud()); }, []);
  const selectedJobKey = selectedJob ? jobId(selectedJob) : "";
  // Switching or closing the job card stops reading the old description.
  useEffect(() => { stopReading(); setReading(false); setScopeOpen(false); }, [selectedJobKey]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [routeSummary, setRouteSummary] = useState<{ stops: number; miles: number; firstStop: string; href: string } | null>(null);
  const [workflowStamps, setWorkflowStamps] = useState<Record<string, { arrived?: string; visit?: string; work?: string; status?: string }>>({});
  const [workflowLoaded, setWorkflowLoaded] = useState(false);
  const [jobsLoadFailed, setJobsLoadFailed] = useState(false);
  const [mediaCounts, setMediaCounts] = useState<Record<string, { before: number; after: number; total: number }>>({});
  // Up to 3 thumbnails per stage for the Media & Documents card.
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, { before: string[]; after: string[] }>>({});
  const [mediaBusy, setMediaBusy] = useState("");
  const [mediaMessage, setMediaMessage] = useState("");
  const [clearJobId, setClearJobId] = useState("");
  const [clearText, setClearText] = useState("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoCameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaChoiceRef = useRef<HTMLDivElement | null>(null);
  const [mediaChoice, setMediaChoice] = useState<FieldMediaKind | null>(null);
  const pendingMediaKindRef = useRef<FieldMediaKind>("before");

  function rememberNavigation(id:string) {
    const entry={id,startedAt:Date.now(),pendingReturn:true};
    currentJobRef.current=entry;setCurrentJob(entry);navigationDeparted.current=false;
    try {localStorage.setItem(CURRENT_JOB_KEY,JSON.stringify(entry));}
    catch {setMediaMessage('Current job could not be saved on this device.');}
  }
  function resumeCurrentJob(entry:CurrentJob) {
    const match=jobs.find(job=>jobId(job)===entry.id);
    if(!match)return;
    const updated={...entry,pendingReturn:false};
    currentJobRef.current=updated;setCurrentJob(updated);
    try {localStorage.setItem(CURRENT_JOB_KEY,JSON.stringify(updated));} catch {}
    setChromeOpen(false);setControlsOpen(false);setAgendaOpen(false);
    setSelectedJob(match);setSheetExpanded(false);
  }
  useEffect(()=>{
    if(!jobs.length||!workflowLoaded)return;
    if(!resumeInitialized.current){
      resumeInitialized.current=true;
      let entry:CurrentJob|null=null;
      try {entry=parseCurrentJob(localStorage.getItem(CURRENT_JOB_KEY));}catch {}
      currentJobRef.current=entry;setCurrentJob(entry);
      if(entry?.pendingReturn&&!new URLSearchParams(window.location.search).has('omo'))resumeCurrentJob(entry);
    }
    const returnToJob=()=>{
      if(document.hidden||!navigationDeparted.current)return;
      navigationDeparted.current=false;
      const entry=currentJobRef.current;
      if(entry?.pendingReturn&&parseCurrentJob(JSON.stringify(entry)))resumeCurrentJob(entry);
    };
    const hidden=()=>{if(document.hidden)navigationDeparted.current=true;else returnToJob();};
    const blur=()=>{navigationDeparted.current=true;};
    window.addEventListener('blur',blur);window.addEventListener('focus',returnToJob);
    window.addEventListener('pageshow',returnToJob);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',blur);window.removeEventListener('focus',returnToJob);window.removeEventListener('pageshow',returnToJob);document.removeEventListener('visibilitychange',hidden);};
  },[jobs,workflowLoaded]);

  useEffect(() => { setMediaChoice(null); }, [selectedJob ? jobId(selectedJob) : ""]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    let latestRows: JobRecord[] | null = null;
    let serverOverrides: Record<string, JobRecord> = {};
    function showRows(data: unknown) {
      const body = data as { jobs?: unknown; data?: unknown; records?: unknown } | unknown[];
      const rows = Array.isArray(body) ? body : body?.jobs || body?.data || body?.records;
      if (!Array.isArray(rows)) throw new Error("Invalid job response");
      latestRows = rows as JobRecord[];
      setJobsLoadFailed(false);
      applyOverrides();
    }
    function applyOverrides() {
      if (cancelled || !latestRows) return;
      const overrides = { ...readSharedWorkflowOverrides(), ...serverOverrides };
      const next = latestRows.map((row: JobRecord) => ({ ...row, ...(overrides[jobId(row)] || {}) }));
      setJobs((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    // Pins show at once from the copy saved on this phone last time, then refresh from the network.
    if (typeof caches !== "undefined") {
      caches.open(JOBS_CACHE).then((cache) => cache.match(JOBS_URL)).then((saved) => saved?.json())
        .then((data) => { if (data && !latestRows) showRows(data); })
        .catch(() => {});
    }
    function refreshJobs() {
      if (loading) return;
      loading = true;
      // no-cache: the phone keeps the file and the server answers "unchanged" quickly when it is.
      fetch(JOBS_URL, { cache: "no-cache" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Job refresh failed");
          // Copy before reading: once the body is read it can't be copied into the phone's cache.
          if (typeof caches !== "undefined") {
            const copy = response.clone();
            caches.open(JOBS_CACHE).then((cache) => cache.put(JOBS_URL, copy)).catch(() => {});
          }
          showRows(await response.json());
        })
        .catch(() => { if (!latestRows) setJobsLoadFailed(true); /* Otherwise keep the last loaded jobs. */ })
        .finally(() => { loading = false; });
      // Saved field statuses merge in when they arrive; they never hold up the pins.
      fetchServerWorkflowOverrides()
        .then((overrides) => { serverOverrides = overrides as Record<string, JobRecord>; applyOverrides(); })
        .catch(() => {});
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
    () => jobs.filter((job) => matchesJobQueue(job, "pending")),
    [jobs]
  );

  const overdueCount = useMemo(
    () => activeJobs.filter((job) => {
      const days = jobPriority(job).days;
      return days !== null && days > 30;
    }).length,
    [activeJobs, calendarDate]
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (!matchesJobQueue(job, status)) return false;
      if (!matchesAwardLookback(job, daysBack)) return false;
      if (!matchesJobDateRange(job, dateRange.field, dateRange.from, dateRange.to)) return false;
      if (borough !== "ALL" && jobBorough(job) !== borough) return false;
      if (q) {
        const haystack = [jobId(job), jobAddress(job), jobBorough(job), jobStatus(job)].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, borough, status, search, daysBack, dateRange, calendarDate]);

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
    const counts: Record<string, number> = { pending: 0, followup: 0, completed: 0, archived: 0 };
    jobs.forEach((job) => {
      const g = jobQueue(job);
      if (g in counts) counts[g] += 1;
    });
    return counts;
  }, [jobs]);

  const mappedCount = useMemo(() => jobs.filter((job) => jobLatLng(job)).length, [jobs]);

  const quickDateKey = daysBack !== null
    ? null
    : QUICK_DATE_RANGES.find(({ key }) => {
        const bounds = quickDateBounds(key, calendarDate);
        return bounds.from === dateRange.from && bounds.to === dateRange.to;
      })?.key ?? null;
  const activeFilterCount = (status !== "pending" ? 1 : 0) + (borough !== "ALL" ? 1 : 0)
    + (dateRange.field !== "award" || quickDateKey !== "year" ? 1 : 0);

  function applyQuickDate(key: QuickDateKey) {
    setDaysBack(null);
    setCustomDateRange(false);
    const bounds = quickDateBounds(key, calendarDate);
    setDateRange(key === "year" && dateRange.field === "award" ? currentYearRange() : { field: dateRange.field, preset: false, ...bounds });
  }

  function resetQuickFilters() {
    setStatus("pending");
    setBorough("ALL");
    setDaysBack(null);
    setCustomDateRange(false);
    setDateRange(currentYearRange());
  }

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
        const lastView = savedMapView();
        const map = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: true,
        }).setView(lastView ? [lastView.lat, lastView.lng] : [40.72, -73.95], lastView ? lastView.zoom : 10);
        // Reopening starts where the map was left, not zoomed out to the whole city.
        if (lastView) restoredMapViewRef.current = true;
        map.on("moveend", () => {
          const center = map.getCenter();
          try { localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })); } catch {}
        });
        mapRef.current = map;
        setRouteMapReady(true);
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
                if (layer.type === "background") gl.setPaintProperty(layer.id, "background-color", "#eef0ed");
                if (layer.type === "fill") {
                  const colors: Record<string, string> = {
                    water: "#a5d7e5", landuse_residential: "#e9ede8", building: "#d3d9d5",
                    park: "#b8d8ab", landcover_wood: "#a9ce9e", landcover_grass: "#c5dfb8",
                  };
                  if (colors[layer.id]) gl.setPaintProperty(layer.id, "fill-color", colors[layer.id]);
                }
                if (layer.type === "line" && /^(road|bridge|tunnel)_/.test(layer.id) && !/rail|path/.test(layer.id)) {
                  gl.setPaintProperty(layer.id, "line-color", layer.id.endsWith("_casing") ? "#cbd2d0" : "#ffffff");
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
          const occupied: { x: number; y: number }[] = [];
          groupByLocation(pointsRef.current).forEach((location) => {
            location.jobs.forEach((job, index) => {
              const meta = { ...jobStatusMeta(job) };
              const visit = visitState(job);
              meta.color = visit.color;
              if (jobQueue(job) === "completed") {
                meta.key = "done";
                meta.color = DONE_COLOR;
              }
              const priority = jobPriority(job);
              const title = `${jobId(job)} - ${meta.label} - ${priority.label} - ${visit.label} - ${visit.count} visits`;
              const offset = map.getZoom() >= 17 ? individualPinOffset(index, location.jobs.length) : { x: 0, y: 0 };
              const origin = map.latLngToLayerPoint([location.lat, location.lng]);
              const position = map.layerPointToLatLng(L.point(origin.x + offset.x, origin.y + offset.y));
              if (!map.getBounds().pad(0.1).contains(position)) return;
              const screen = map.latLngToContainerPoint(position);
              const showLabel = reservePinLabel(screen.x, screen.y, occupied);
              const html = showLabel
                ? ageMarkerHtml(priority.days, priority.pending, map.getZoom(), false, meta.color, meta.key) + (visit.count ? `<span class="fc-visit-pin-count">${visit.count}v</span>` : "")
                : `<span class="fc-job-dot" style="--pin-color:${meta.color}"></span>`;
              if (map.getZoom() >= 17 && location.jobs.length > 1) {
                L.polyline([[location.lat, location.lng], position], { color: meta.color, weight: 1, opacity: 0.7, interactive: false }).addTo(layerGroupRef.current);
              }
              const icon = L.divIcon({ className: showLabel ? "fc-label-marker" : "fc-dot-marker", html, iconSize: showLabel ? [44, 32] : [14, 14], iconAnchor: showLabel ? [22, 16] : [7, 7] });
              const marker = L.marker(position, { icon, title, zIndexOffset: showLabel ? 1000 : 0 });
              marker.on("click", () => {
                if (!showLabel || location.jobs.length > 1) map.setView([location.lat, location.lng], Math.max(17, map.getZoom()));
                setSelectedJob(job);
              });
              marker.addTo(layerGroupRef.current);
              marker.getElement()?.setAttribute("aria-label", title);
            });
          });
        };

        // Recompute visible labels after movement; retain individual dots for crowded jobs.
        map.on("moveend", () => renderMarkersRef.current());

      }

      const map = mapRef.current;

      const framing = `${borough}|${search}|${status}|${daysBack}|${JSON.stringify(dateRange)}`;
      if (mapFramingRef.current !== framing && points.length && restoredMapViewRef.current && !mapFramingRef.current) {
        // First load after reopening: keep the saved view; later filter/search changes still frame.
        mapFramingRef.current = framing;
      } else if (mapFramingRef.current !== framing && points.length) {
        mapFramingRef.current = framing;
        if (points.length === 1) {
          map.setView([points[0].lat, points[0].lng], 15);
        } else if (points.length > 1 && borough === "ALL" && !search.trim()) {
          // Keep the initial city view useful even when a record lies far outside NYC.
          map.setView([40.72, -73.95], 14);
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
  }, [filteredJobs, borough, search, status, daysBack, dateRange]);

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
  }, [borough, status, search, daysBack, dateRange, jobs]);

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

  async function placeUserMarker(latitude: number, longitude: number) {
    lastPositionRef.current = { lat: latitude, lng: longitude };
    if (!mapRef.current) return;
    const leafletModule = await import("leaflet");
    const L = (leafletModule as any).default || leafletModule;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([latitude, longitude]);
      return;
    }
    const icon = L.divIcon({
      className: "",
      html: '<div class="fc-you-are-here"><span class="fc-you-are-here-pulse"></span></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    userMarkerRef.current = L.marker([latitude, longitude], { icon, interactive: false, zIndexOffset: 1000 }).addTo(mapRef.current);
  }

  useEffect(() => {
    if (!routeMapReady || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocateStatus("idle");
        placeUserMarker(position.coords.latitude, position.coords.longitude);
      },
      () => setLocateStatus("error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [routeMapReady]);

  function locateMe() {
    if (!navigator.geolocation) {
      setLocateStatus("error");
      return;
    }
    if (lastPositionRef.current && mapRef.current) {
      mapRef.current.flyTo([lastPositionRef.current.lat, lastPositionRef.current.lng], 15);
      return;
    }
    setLocateStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocateStatus("idle");
        const { latitude, longitude } = position.coords;
        placeUserMarker(latitude, longitude);
        mapRef.current?.flyTo([latitude, longitude], 15);
      },
      () => setLocateStatus("error"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  async function drawDayRoute(stops: RouteJob[], origin: RoutePoint) {
    const request = ++dayRouteRequest.current;
    const leafletModule = await import("leaflet");
    if (request !== dayRouteRequest.current || !mapRef.current) return;
    const L = (leafletModule as any).default || leafletModule;
    dayRouteLayerRef.current?.remove();
    if (!stops.length) return;
    for (const [name, z] of [["fc-route-path", "610"], ["fc-route-stops", "620"]]) {
      const pane = mapRef.current.getPane(name) || mapRef.current.createPane(name);
      pane.style.zIndex = z;
    }
    const line = [origin, ...stops].map(p => [p.lat, p.lng]);
    dayRouteLayerRef.current = L.featureGroup([
      L.polyline(line, { pane:"fc-route-path", color: "#ffffff", weight: 11, opacity: 0.95, interactive: false }),
      L.polyline(line, { pane:"fc-route-path", color: "#1267df", weight: 7, opacity: 1, interactive: false }),
      L.polyline(line, { pane:"fc-route-path", color: "#d8f8ff", weight: 3, dashArray: "3 19", opacity: 1, interactive: false, className: "fc-route-flow" }),
      ...stops.flatMap((job, index) => {
        const previous = index ? stops[index-1] : origin;
        const from = mapRef.current.project([previous.lat, previous.lng], 14);
        const to = mapRef.current.project([job.lat, job.lng], 14);
        if (from.distanceTo(to) < 24) return [];
        const angle = Math.atan2(to.y-from.y, to.x-from.x)*180/Math.PI;
        const midpoint = mapRef.current.unproject([(from.x+to.x)/2, (from.y+to.y)/2],14);
        return [L.marker(midpoint, {pane:"fc-route-stops", interactive:false, icon:L.divIcon({className:"fc-route-direction",html:`<span style="transform:rotate(${angle}deg)"></span>`,iconSize:[18,18],iconAnchor:[9,9]})})];
      }),
      ...stops.map((job, index) => L.marker([job.lat, job.lng], {
        icon: L.divIcon({className:`fc-route-number${index===0?' is-next':''}`,html:String(index+1),iconSize:[32,32],iconAnchor:[16,16]}),
        pane:"fc-route-stops", title: `Route stop ${index+1}: ${job.id}`, zIndexOffset: 2000,
      }).on('click',()=>setSelectedJob(jobs.find(row=>jobId(row)===job.id)||null)))
    ]).addTo(mapRef.current);
    mapRef.current.fitBounds(dayRouteLayerRef.current.getBounds(), {padding:[36,60],maxZoom:15});
  }

  const routeJobs = useMemo<RouteJob[]>(() => jobs.flatMap(job => {
    const point = jobLatLng(job); if (!point) return [];
    const queue = jobQueue(job);
    return [{id:jobId(job),address:jobAddress(job),borough:jobBorough(job),...point,days:jobPriority(job).days,pending:queue==='pending',closed:queue==='completed'||queue==='archived',blocked:visitState(job).blocked,appointment:job.Appointment as Appointment|undefined}];
  }), [jobs, calendarDate]);

  async function previewLocalRoute() {
    if (!mapRef.current || !pointsRef.current.length) return;
    const leafletModule = await import("leaflet");
    const L = (leafletModule as any).default || leafletModule;
    const center = userMarkerRef.current?.getLatLng?.() || mapRef.current.getCenter();
    const origin = { lat: Number(center.lat), lng: Number(center.lng) };
    const stops = pointsRef.current
      .filter(({ job }) => matchesJobQueue(job, "pending") && !visitState(job).blocked)
      .map((point) => ({ ...point, miles: distanceMiles(origin, { lat: point.lat, lng: point.lng }) }))
      .sort((a, b) => Math.max(0, jobPriority(b.job).days || 0) - Math.max(0, jobPriority(a.job).days || 0) || a.miles - b.miles)
      .slice(0, 6);

    if (!stops.length) return;
    if (routeLayerRef.current) routeLayerRef.current.remove();
    const routePoints = [origin, ...stops.map((point) => ({ lat: point.lat, lng: point.lng }))];
    const latLngs = routePoints.map((point) => [point.lat, point.lng]);
    routeLayerRef.current = L.featureGroup([
      L.polyline(latLngs, { color: "#ffffff", weight: 11, opacity: 0.95, interactive:false }),
      L.polyline(latLngs, { color: "#1267df", weight: 7, opacity: 1, interactive:false }),
      L.polyline(latLngs, { color: "#d8f8ff", weight: 3, opacity: 1, dashArray: "3 19", interactive:false, className:"fc-route-flow" }),
    ]).addTo(mapRef.current);
    mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [42, 42], maxZoom: 14 });
    setRouteSummary({
      stops: stops.length,
      miles: routePoints.slice(1).reduce((sum, point, index) => sum + distanceMiles(routePoints[index], point), 0),
      firstStop: jobId(stops[0].job),
      href: googleRouteHref(routePoints),
    });
  }

  // "Everything is correct": takes a finished job off the active map. Only offered once its
  // paperwork is approved; archived jobs stay under Status > Archive.
  async function archiveJob(job: JobRecord) {
    const id = jobId(job);
    if (!window.confirm(`Archive ${id}? Only do this if the work, paperwork and email are all correct.`)) return;
    const now = new Date().toISOString();
    const patch = { ArchivedFromMap: true, archivedFromMap: true, ArchivedAt: now, archivedAt: now };
    try { writeSharedWorkflowPatch(id, patch); }
    catch { setOutcomeMessage("Could not archive on this device. Please retry."); return; }
    mergeWorkflowPatchIntoScreen(id, patch);
    setSelectedJob(null);
    try {
      await fetch(`${HPD_STATUS_WORKER_URL}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: id, patch }) });
    } catch { /* Saved on this device; the next sync carries it. */ }
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

  function openAppointment() {
    setAppointmentOpen(true);
    setSheetExpanded(true);
    requestAnimationFrame(() => appointmentRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function saveAppointment(job: JobRecord, appointment: Appointment) {
    const id = jobId(job);
    const latest = { ...job, ...readSharedWorkflowOverrides()[id] };
    const patch = appointmentPatch(latest, appointment);
    writeSharedWorkflowPatch(id, patch);
    mergeWorkflowPatchIntoScreen(id, patch);
    setWorkflowStamps(prev => ({ ...prev, [id]: { ...prev[id], status: patch.status } }));
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
      if (review) window.location.assign(paperworkGenerateHref(id, draft.outcome));
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
    const thumbs = (kind: string) => rows
      .filter((media) => media.kind === kind)
      .map((media) => (media.mediaType === "video" ? media.posterDataUrl || "" : media.dataUrl))
      .filter(Boolean)
      .slice(-3);
    setMediaThumbs((prev) => ({ ...prev, [id]: { before: thumbs("before"), after: thumbs("after") } }));
  }

  function requestMediaUpload(kind: FieldMediaKind) {
    setMediaChoice(kind);
    requestAnimationFrame(() => mediaChoiceRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  function chooseMediaSource(source: "camera" | "library" | "video-camera" | "video-library") {
    if (!mediaChoice || mediaBusy) return;
    const kind = mediaChoice;
    pendingMediaKindRef.current = kind;
    if (source === "video-camera") videoCameraInputRef.current?.click();
    else if (source === "video-library") videoLibraryInputRef.current?.click();
    else if (source === "camera") cameraInputRef.current?.click();
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
      const unstamped = saved.filter(item => item.mediaType === "video" && item.stamped === false).length;
      setMediaMessage(saved.length ? `${kind === "before" ? "Before" : "After"} media saved: ${saved.length}.${unstamped ? ` ${unstamped} video(s) saved as originals without burned-in labels; review before submitting.` : ""}` : "No image or video was saved.");
      // Before photos mark the work start (date used on the affidavit); no separate "Start work" tap.
      if (kind === "before" && saved.length && !workflowStamps[id]?.work) saveWorkflowStamp(selectedJob, "work", "Work Started");
      if (kind === "after" && saved.length) openOutcomePanel();
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : "Media save failed.");
    } finally {
      setMediaBusy("");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (videoCameraInputRef.current) videoCameraInputRef.current.value = "";
      if (videoLibraryInputRef.current) videoLibraryInputRef.current.value = "";
    }
  }

  function beginClearWorkflow(job: JobRecord) {
    setClearJobId(jobId(job));
    setClearText("");
  }

  // Undo a saved outcome (e.g. No access, then access was given) without wiping the visit:
  // arrival, photos and visit history stay; a history line records what was cleared, and the
  // job is open for work again.
  function clearOutcome(job: JobRecord) {
    const id = jobId(job);
    const previous = FIELD_OUTCOMES[value(job, ["FieldOutcome", "fieldOutcome", "WorkflowStatus"])] || value(job, ["StatusOverride", "status"]) || "outcome";
    if (!window.confirm(`Clear "${previous}" for ${id}? Photos and visit history are kept.`)) return;
    const now = new Date();
    const stamps = workflowStamps[id] || {};
    const statusLabel = stamps.work ? "Work Started" : stamps.arrived ? "Arrived" : "Pending";
    const history = Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : [];
    const patch: Record<string, unknown> = {
      WorkflowStatus: "", workflowStatus: "", FieldOutcome: "", fieldOutcome: "",
      StatusOverride: statusLabel, status: statusLabel,
      OutcomeLockedAt: "", outcomeLockedAt: "", RefusalDate: "", NoAccessFirstAttemptAt: "", SecondAttemptAvailableAt: "",
      PackageReviewStatus: "",
      FieldVisitHistory: [...history, { recordedAt: now.toISOString(), outcome: null, note: `Outcome cleared (was ${previous}).` }],
      // Lets the job be worked again even if an earlier visit was No access / Refused.
      RevisitApprovedAt: new Date(now.getTime() + 1000).toISOString(),
    };
    try { writeSharedWorkflowPatch(id, patch); }
    catch { setOutcomeMessage("Could not clear the outcome on this device. Please retry."); return; }
    mergeWorkflowPatchIntoScreen(id, patch);
    setWorkflowStamps((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status: statusLabel } }));
    setOutcomeMessage(`Outcome cleared. ${id} is open again.`);
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
      <button type="button" className="fc-reveal-controls" aria-label={chromeOpen ? "Hide all map controls" : "Show map controls"} title={chromeOpen ? "Hide controls" : "Map menu"} aria-expanded={chromeOpen} onClick={() => { setChromeOpen((open) => !open); setControlsOpen(false); setSelectedJob(null); }}><MenuIcon /></button>
      <div className="fc-search-row">
        <div className="fc-search-field">
          <SearchIcon />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address or job" aria-label="Search jobs" />
        </div>
        <button type="button" className={`fc-filter-btn ${filtersOpen ? "is-open" : ""}`} data-hpd-smoke="fc-filter-button" aria-label="Filters" aria-expanded={filtersOpen} aria-controls="fc-quick-filters" onClick={() => { setFiltersOpen((open) => !open); setChromeOpen(false); }}>
          <FilterIcon />
          {activeFilterCount ? <span className="fc-filter-badge">{activeFilterCount}</span> : null}
        </button>
      </div>
      {!selectedJob && !filtersOpen ? (
        <nav className="fc-borough-bar" data-hpd-smoke="fc-borough-bar" aria-label="Borough and date">
          <div className="fc-bar-boroughs">
            <button type="button" className={borough === "ALL" ? "is-active" : ""} aria-pressed={borough === "ALL"} onClick={() => setBorough("ALL")}>
              <span aria-hidden="true">🗽</span><small>All</small>
            </button>
            {BOROUGHS.map(({ key, label, color }) => (
              <button key={key} type="button" className={borough === key ? "is-active" : ""} aria-pressed={borough === key} aria-label={label} style={{ "--boro": color } as CSSProperties} onClick={() => setBorough(borough === key ? "ALL" : key)}>
                <span aria-hidden="true">{BOROUGH_ICONS[key]}</span><small>{key}</small>
              </button>
            ))}
          </div>
          <div className="fc-bar-days-row">
            {(["last30", "last60", "last90"] as const).map((key) => (
              <button key={key} type="button" className={quickDateKey === key ? "is-active" : ""} aria-pressed={quickDateKey === key} onClick={() => applyQuickDate(quickDateKey === key ? "year" : key)}>
                {key.slice(4)} days
              </button>
            ))}
            <button type="button" onClick={() => setFiltersOpen(true)}>Custom</button>
          </div>
        </nav>
      ) : null}
      {filtersOpen ? (
        <section id="fc-quick-filters" className="fc-quick-filters" data-hpd-smoke="fc-quick-filters" aria-label="Quick filters">
          <div className="fc-quick-head">
            <strong>{filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}</strong>
            <button type="button" onClick={resetQuickFilters}>Reset</button>
            <button type="button" onClick={() => setFiltersOpen(false)}>Done</button>
          </div>
          <span className="fc-quick-label">Status</span>
          <div className="fc-quick-chips">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button key={key} type="button" className={status === key ? "is-active" : ""} aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label} <b>{key === "all" ? jobs.length : statusCounts[key] || 0}</b>
              </button>
            ))}
          </div>
          <span className="fc-quick-label">Borough</span>
          <div className="fc-quick-chips">
            <button type="button" className={borough === "ALL" ? "is-active" : ""} aria-pressed={borough === "ALL"} onClick={() => setBorough("ALL")}>All</button>
            {BOROUGHS.map(({ key, label }) => (
              <button key={key} type="button" className={borough === key ? "is-active" : ""} aria-pressed={borough === key} onClick={() => setBorough(key)}>
                {label} <b>{boroughCounts[key]}</b>
              </button>
            ))}
          </div>
          <span className="fc-quick-label">Date</span>
          <div className="fc-quick-chips">
            {(Object.keys(JOB_DATE_FIELDS) as JobDateField[]).map((field) => (
              <button key={field} type="button" className={dateRange.field === field ? "is-active" : ""} aria-pressed={dateRange.field === field} onClick={() => setDateRange({ ...dateRange, preset: false, field })}>
                {JOB_DATE_FIELDS[field]}
              </button>
            ))}
          </div>
          <div className="fc-quick-chips">
            {QUICK_DATE_RANGES.map((range) => (
              <button key={range.key} type="button" className={quickDateKey === range.key ? "is-active" : ""} aria-pressed={quickDateKey === range.key} onClick={() => applyQuickDate(range.key)}>
                {range.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {chromeOpen && !controlsOpen && <nav className="fc-organized-menu" aria-label="Map menu">
        <strong>Map menu</strong>
        <button type="button" onClick={()=>{setChromeOpen(false);setControlsOpen(false);setPlannerRequest(value=>value+1);}}><ListIcon />Plan my day</button>
        <button type="button" aria-controls="field-map-filters" onClick={() => setControlsOpen(true)}><ListIcon />Filters</button>
        <Link href="/jobs/"><ListIcon />Jobs</Link>
        <Link href="/alerts/"><BellIcon />Alerts</Link>
        <Link href="/storage/"><MenuIcon />Backup &amp; recovery</Link>
        <Link href="/more/"><MenuIcon />More</Link>
      </nav>}
      <section id="field-map-filters" className="fc-control-drawer" aria-label="Map filters">
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <span className="fc-brand-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3z" fill="rgba(255,255,255,.14)" />
              </svg>
              <b>HPD</b>
            </span>
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
          <select id="award-range" aria-label="Award date range" value={dateRange.preset ? "year" : customDateRange || (daysBack !== null && ![30,90,180,365].includes(daysBack)) ? "custom" : daysBack ?? "all"} onChange={(event) => {
            const selected = event.target.value;
            setDateRange(selected === "year" ? currentYearRange() : { field: "award", from: "", to: "" });
            setCustomDateRange(selected === "custom");
            if (selected !== "custom") setDaysBack(selected === "all" || selected === "year" ? null : Number(selected));
          }}>
            <option value="year">Current year</option>
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
          <div className="fc-date-picker">
            <label>Date type<select aria-label="Date type" value={dateRange.field} onChange={(e) => setDateRange({ ...dateRange, preset: false, field: e.target.value as JobDateField })}>
              {Object.entries(JOB_DATE_FIELDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <div className="fc-date-bounds">
              <label>From<input type="date" aria-label="Date from" value={dateRange.from} onChange={(e) => { setDaysBack(null); setDateRange({ ...dateRange, preset: false, from: e.target.value }); }} /></label>
              <label>Through<input type="date" aria-label="Date through" value={dateRange.to} onChange={(e) => { setDaysBack(null); setDateRange({ ...dateRange, preset: false, to: e.target.value }); }} /></label>
            </div>
            {dateRange.from && dateRange.to && dateRange.from > dateRange.to ? <span role="alert">From must be on or before Through.</span> : null}
            <button type="button" onClick={() => { setDateRange(currentYearRange()); setDaysBack(null); setCustomDateRange(false); }}>Current year</button>
            <button type="button" onClick={() => { setDateRange({ field: "award", from: "", to: "" }); setDaysBack(null); setCustomDateRange(false); }}>All dates</button>
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
        <div ref={mapNode} className={`fc-map-node ${darkTiles ? "is-dark" : ""}`} />
        <div className="fc-map-controls">
          <button
            type="button"
            className={`fc-map-fab fc-route-fab ${routeSummary ? "is-active" : ""}`}
            aria-label="Preview smart route"
            onClick={previewLocalRoute}
          >
            <RouteIcon />
          </button>
          <button type="button" className="fc-map-fab" aria-label="Today's appointments" title="Today's appointments" onClick={() => { setAgendaOpen(true); setSelectedJob(null); }}><ListIcon /></button>
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
            className={`fc-map-fab ${locateStatus === "loading" ? "is-busy" : ""}`}
            aria-label="Locate me"
            onClick={locateMe}
          >
            <LocateIcon />
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

        {/* Status messages stack below the search box instead of overlapping each other. */}
        <div className="fc-map-hints" hidden={filtersOpen}>
          {locateStatus === "error" ? (
            <p className="fc-map-hint fc-map-hint-warn">Couldn&apos;t get your location</p>
          ) : null}

          {!jobs.length ? (
            <p className={`fc-map-hint ${jobsLoadFailed ? "fc-map-hint-warn" : ""}`} role="status">{jobsLoadFailed ? "Couldn't load jobs. Check the connection; retrying." : "Loading jobs..."}</p>
          ) : !filteredJobs.length ? (
            <p className="fc-map-hint">No jobs match these filters</p>
          ) : null}

          {filteredJobs.length > 0 && !mappedFilteredCount ? (
            <p className="fc-map-hint">No mapped jobs match these filters</p>
          ) : null}
        </div>

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

        <div hidden={!!selectedJob || agendaOpen || chromeOpen}>
          {currentJob&&jobs.some(job=>jobId(job)===currentJob.id)&&<div className="fc-current-job"><button type="button" onClick={()=>resumeCurrentJob(currentJob)}>Resume current job · {currentJob.id}</button><button type="button" aria-label="Dismiss current job" onClick={()=>{currentJobRef.current=null;setCurrentJob(null);try{localStorage.removeItem(CURRENT_JOB_KEY);}catch{}}}>&times;</button></div>}
          <TodayRoute jobs={routeJobs} mapReady={routeMapReady} getOrigin={() => {
            const location = userMarkerRef.current?.getLatLng?.();
            const center = location || mapRef.current?.getCenter() || {lat:40.72,lng:-73.95};
            return {point:{lat:center.lat,lng:center.lng},label:location?'Your location':'Map center (location not set)'};
          }} onNavigate={rememberNavigation} onPreview={drawDayRoute} onSelect={id => {setSelectedJob(jobs.find(job=>jobId(job)===id)||null);setSheetExpanded(false);}} />
        </div>
        {agendaOpen ? <aside className="fc-appointment-agenda" aria-label="Today's appointments">
          <header><strong>Today&apos;s appointments</strong><button type="button" aria-label="Close appointments" onClick={() => setAgendaOpen(false)}>&times;</button></header>
          <p>{nyToday()} · New York · This device</p>
          {(() => {
            const today = jobs.filter(row => { const a = row.Appointment as Appointment | undefined; return a && a.date === nyToday() && ['requested', 'confirmed'].includes(a.state); }).sort((a, b) => (a.Appointment as Appointment).start.localeCompare((b.Appointment as Appointment).start));
            return today.length ? today.map(row => { const a = row.Appointment as Appointment; return <button type="button" key={jobId(row)} onClick={() => { setAgendaOpen(false); setStatus('all'); setDaysBack(null); setSearch(jobId(row)); setSelectedJob(row); setSheetExpanded(false); }}><strong>{a.start}-{a.end} · {a.state}</strong><span>{jobId(row)} · {jobAddress(row)}</span></button>; }) : <p>No appointments saved for today.</p>;
          })()}
        </aside> : null}
        {selectedJob ? (() => {
          const id = jobId(selectedJob);
          const scope = jobScope(selectedJob);
          const tenant = tenantInfo(selectedJob);
          const stamps = workflowStamps[id] || {};
          const counts = mediaCounts[id] || { before: 0, after: 0, total: 0 };
          const next = nextFieldAction(stamps, counts, jobStatus(selectedJob));
          const draft = outcomeDrafts[id] || { outcome: "", note: "" };
          const paperworkHref = paperworkNextHref(id, value(selectedJob, ["WorkflowStatus", "workflowStatus", "FieldOutcome", "fieldOutcome"]));
          const hasScope = scope !== SCOPE_MISSING;
          return (
            <div ref={jobSheetRef} id="fc-job-card" className="fc-job-sheet fc-job-sheet-flow" aria-label="Selected job">
              <button type="button" className="fc-sheet-handle" aria-label={sheetExpanded ? "Collapse job details" : "Expand job details"} aria-expanded={sheetExpanded} onTouchStart={(event) => { sheetTouchStart.current = event.touches[0].clientY; }} onTouchEnd={(event) => {
                const start = sheetTouchStart.current;
                sheetTouchStart.current = null;
                if (start !== null && Math.abs(event.changedTouches[0].clientY - start) > 30) {
                  event.preventDefault();
                  setSheetExpanded(event.changedTouches[0].clientY < start);
                }
              }} onTouchCancel={() => { sheetTouchStart.current = null; }} onClick={() => setSheetExpanded((expanded) => !expanded)}><span /></button>
              <button type="button" className="fc-job-sheet-close" aria-label="Close" title="Close job details" onClick={() => setSelectedJob(null)}>
                <span aria-hidden="true">&times;</span>
              </button>
              <header className="jc-hero">
                <div className="jc-hero-top">
                  <strong className="jc-omo">{id}</strong>
                  <span className="jc-status" style={{ "--jc-status": jobStatusMeta(selectedJob).color } as CSSProperties}>
                    <i aria-hidden="true" />{stamps.status || jobStatusMeta(selectedJob).label}
                  </span>
                </div>
                <span className="jc-borough">{BOROUGHS.find((item) => item.key === jobBorough(selectedJob))?.label || "NYC"}</span>
                <p className="jc-address">{jobAddress(selectedJob)}</p>
                <div className="jc-nav">
                  <a className="jc-btn jc-btn-waze" href={wazeHref(selectedJob)} onClick={()=>rememberNavigation(id)} target="_blank" rel="noreferrer">Waze</a>
                  <a className="jc-btn jc-btn-google" href={directionsHref(selectedJob)} onClick={()=>rememberNavigation(id)} target="_blank" rel="noreferrer">Google</a>
                  {tenant.phone ? <a className="jc-btn jc-btn-call" href={`tel:${tenant.phone}`}><CallIcon />Call</a> : null}
                </div>
              </header>

              <section className="jc-description" aria-label="Job description" data-hpd-smoke="jc-description">
                <div className="jc-section-head">
                  <strong>Job Description</strong>
                  {hasScope && scope.length > 260 ? <button type="button" className="jc-description-more" onClick={() => setScopeOpen((open) => !open)}>{scopeOpen ? "Less" : "All"}</button> : null}
                </div>
                <p className={`jc-description-text ${scopeOpen ? "is-open" : ""} ${hasScope ? "" : "is-missing"}`} data-hpd-smoke="jc-description-text">{scope}</p>
                {hasScope && speechOk ? (
                  <div className="jc-description-actions">
                    <button type="button" className="jc-read" data-hpd-smoke="jc-description-read" onClick={() => setReading(readAloud(`Job ${id}. ${jobAddress(selectedJob)}. ${scope}`, () => setReading(false)))}>
                      {reading ? "🔊 Reading..." : "🔊 Read aloud"}
                    </button>
                    <button type="button" data-hpd-smoke="jc-description-stop" onClick={() => { stopReading(); setReading(false); }} disabled={!reading}>Stop</button>
                  </div>
                ) : null}
              </section>

              <div className="jc-facts">
                <div className="jc-fact">
                  <small>Maturity</small>
                  <strong>{maturityDate(selectedJob) || "Not available"}</strong>
                  <span className="jc-priority" data-priority={jobPriority(selectedJob).band}>{jobPriority(selectedJob).label}</span>
                </div>
                <div className="jc-fact">
                  <small>COA Amount</small>
                  <strong>{jobAwardAmount(selectedJob) > 0 ? `$${jobAwardAmount(selectedJob).toLocaleString()}` : "Not listed"}</strong>
                </div>
                <div className="jc-fact jc-fact-wide">
                  <small>Tenant</small>
                  <strong>{tenant.name || (tenant.phone ? "Name not listed" : "Not listed")}</strong>
                  {tenant.phone ? <span>{tenant.phone}</span> : null}
                </div>
              </div>
              {jobDateWarning(selectedJob) && <p className="jc-warning" role="status">{jobDateWarning(selectedJob)}</p>}

              {jobQueue(selectedJob) === "completed" ? (
                <section className="jc-done" data-hpd-smoke="jc-completed" aria-label="Job completed">
                  <strong>✓ Completed. No need to come back.</strong>
                  {value(selectedJob, ["PackageApprovedAt"]) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"])) ? (
                    <>
                      <span>Paperwork approved{value(selectedJob, ["PackageApprovedAt"]) ? ` ${formatSavedTime(value(selectedJob, ["PackageApprovedAt"]))}` : ""}.</span>
                      <button type="button" data-hpd-smoke="jc-archive" onClick={() => void archiveJob(selectedJob)}>Everything is correct: Archive</button>
                    </>
                  ) : (
                    <a href={paperworkHref} data-hpd-smoke="jc-done-paperwork">Paperwork not approved yet: finish the package →</a>
                  )}
                </section>
              ) : null}

              <div className="fc-visit-summary jc-visit" style={{borderLeftColor:visitState(selectedJob).color}}>
                <strong>{visitState(selectedJob).label} · {visitState(selectedJob).count} recorded visits</strong>
                {visitState(selectedJob).lastAt && <span>Last visit: {/^\d{4}-\d{2}-\d{2}$/.test(visitState(selectedJob).lastAt) ? visitState(selectedJob).lastAt : formatSavedTime(visitState(selectedJob).lastAt)}</span>}
                {visitState(selectedJob).count > 0 && <span>{FIELD_OUTCOMES[visitState(selectedJob).lastOutcome] || visitState(selectedJob).lastOutcome}</span>}
                {visitState(selectedJob).note && <span>{visitState(selectedJob).note}</span>}
                {selectedJob.Appointment ? (() => { const a = selectedJob.Appointment as Appointment; return <span>Appointment: {a.date} {a.start}-{a.end} ({a.state})</span>; })() : null}
                {visitState(selectedJob).kind === "blocked" && <span>Excluded from routes. Review required before returning.</span>}
                {["blocked","return"].includes(visitState(selectedJob).kind) && <button type="button" onClick={() => {
                  if (!window.confirm("Approve a return visit to this job? Existing visit records will be kept.")) return;
                  const patch = {RevisitApprovedAt:new Date().toISOString()};
                  try { writeSharedWorkflowPatch(jobId(selectedJob),patch); mergeWorkflowPatchIntoScreen(jobId(selectedJob),patch); }
                  catch { setOutcomeMessage("Return approval could not be saved. Try again."); }
                }}>Approve return visit</button>}
              </div>

              <div className="jc-next">
                {next.key === "before" || next.key === "after" ? (
                  <>
                    <p className="jc-next-hint">Next: {next.label} in Media &amp; Documents below</p>
                    {/* No access / refused don't need photos: go straight to the outcome. */}
                    <button type="button" className="jc-skip-photos" data-hpd-smoke="jc-skip-photos" onClick={openOutcomePanel}>No access or refused? Record outcome</button>
                  </>
                ) : next.key === "review" ? (
                  <a href={paperworkHref} className="fc-next-action jc-glow">{next.label}<span aria-hidden="true">&rarr;</span></a>
                ) : next.key === "record" ? (
                  <button type="button" className="fc-next-action jc-glow" onClick={openOutcomePanel}>{next.label}<span aria-hidden="true">&rarr;</span></button>
                ) : (
                  <button type="button" className="fc-next-action jc-glow" disabled={!workflowLoaded || Boolean(mediaBusy)} onClick={() => {
                    saveWorkflowStamp(selectedJob, next.key);
                  }}>{mediaBusy ? "Saving media..." : next.label}<span aria-hidden="true">&rarr;</span></button>
                )}
                {outcomeMessage ? <p className="fc-save-message" role="status">{outcomeMessage}</p> : null}
              </div>

              <section className="jc-media-docs" aria-label="Media and documents">
                <div className="jc-section-head">
                  <strong>Media &amp; Documents</strong>
                  <span>{counts.total} saved</span>
                </div>
                {mediaMessage ? <p className="fc-save-message" role="status">{mediaMessage}</p> : null}
                <div className="jc-stages" role="group" aria-label="Job photos and videos">
                  {(["before", "after"] as const).map((kind) => {
                    const thumbs = mediaThumbs[id]?.[kind] || [];
                    return (
                      <button type="button" key={kind} className={`jc-stage ${mediaChoice === kind ? "is-open" : ""} ${next.key === kind ? "is-next" : ""}`} aria-expanded={mediaChoice === kind} onClick={() => requestMediaUpload(kind)} disabled={Boolean(mediaBusy)}>
                        <span className="jc-thumbs">
                          {thumbs.length ? thumbs.map((src, index) => <img key={index} src={src} alt="" />) : <PhotosIcon />}
                        </span>
                        <b>{kind === "before" ? "Before" : "After"}</b>
                        <small>{counts[kind] ? `${counts[kind]} saved · add more` : "Tap to add"}</small>
                      </button>
                    );
                  })}
                </div>
                {mediaChoice ? <div ref={mediaChoiceRef} className="fc-photo-choice jc-choice" role="group" aria-label={`${mediaChoice} photo source`}>
                  <div className="fc-photo-choice-heading"><strong>{mediaChoice === "before" ? "Before work" : "After work"}</strong><button type="button" aria-label="Cancel photo selection" onClick={() => setMediaChoice(null)}>&times;</button></div>
                  <div className="fc-photo-source-actions">
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("camera")}><PhotosIcon />Take photo</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("library")}><DocumentsIcon />Add photos</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("video-camera")}>Record video</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("video-library")}>Add videos</button>
                  </div>
                </div> : null}
                <BuildingPhoto key={id} id={id} address={jobAddress(selectedJob)} borough={String(jobBorough(selectedJob))} point={jobLatLng(selectedJob)} />
                <div className="jc-docs">
                  <a className="jc-doc jc-doc-primary" href={paperworkHref}>
                    <DocumentsIcon />
                    <span><b>Affidavit + Invoice</b><small>{packageStatusText(selectedJob)}</small></span>
                    <i aria-hidden="true">&rarr;</i>
                  </a>
                  {value(selectedJob, ["PackageDriveLink"]) ? (
                    <a className="jc-doc" href={value(selectedJob, ["PackageDriveLink"])} target="_blank" rel="noreferrer">
                      <DocumentsIcon />
                      <span><b>Package in Google Drive</b><small>Saved approved package</small></span>
                      <i aria-hidden="true">&#8599;</i>
                    </a>
                  ) : null}
                  <Link className="jc-doc" href={`/jobs/${id}`}>
                    <DocumentsIcon />
                    <span><b>Job documents</b><small>ITB, COA and saved files</small></span>
                    <i aria-hidden="true">&rarr;</i>
                  </Link>
                </div>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="fc-hidden-file"
                  onChange={(event) => void handleMediaFiles(event.target.files)}
                />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
                <input ref={videoCameraInputRef} type="file" accept="video/*" capture="environment" className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
                <input ref={videoLibraryInputRef} type="file" accept="video/*,.mov,.mp4,.m4v,.webm" multiple className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
              </section>

              <div className="fc-card-footer jc-footer">
              <button type="button" className="fc-outcome-link" onClick={openOutcomePanel}>Outcome</button>
              <button type="button" className="fc-outcome-link" onClick={openAppointment}>Appointment</button>
              <button type="button" className="fc-job-details-toggle" aria-expanded={sheetExpanded} onClick={() => setSheetExpanded((expanded) => !expanded)}>{sheetExpanded ? "Less" : "Details"}<span aria-hidden="true">{sheetExpanded ? "⌄" : "⌃"}</span></button>
              </div>
              <details className="jc-dates">
                <summary>Job dates</summary>
                <dl>
                  <div><dt>Award date</dt><dd>{value(selectedJob, ["AwardDate", "awardDate"]) || "Not available"}</dd></div>
                  <div><dt>Maturity date{!["MaturityDate", "maturityDate", "DueDate", "dueDate"].some(key => selectedJob[key] !== undefined && selectedJob[key] !== null) ? " (contract finish)" : ""}</dt><dd>{maturityDate(selectedJob) || "Not available"}</dd></div>
                  <div><dt>Contract start</dt><dd>{jobDate(selectedJob, "start") || "Not available"}</dd></div>
                  <div><dt>Contract finish</dt><dd>{jobDate(selectedJob, "finish") || "Not available"}</dd></div>
                  <div><dt>Actual work start</dt><dd>{value(selectedJob, ["ActualWorkStartDate", "actualWorkStartDate"]) || "Not recorded"}</dd></div>
                  <div><dt>Actual work finish</dt><dd>{value(selectedJob, ["ActualWorkCompletionDate", "actualWorkCompletionDate"]) || "Not recorded"}</dd></div>
                </dl>
              </details>
              {selectedJob.Appointment ? <button type="button" className="fc-appointment-summary" onClick={openAppointment}>{(selectedJob.Appointment as Appointment).date} · {(selectedJob.Appointment as Appointment).start}-{(selectedJob.Appointment as Appointment).end} · {(selectedJob.Appointment as Appointment).state}</button> : null}
              <div ref={appointmentRef} hidden={!appointmentOpen || !sheetExpanded}>
                {appointmentOpen && <AppointmentEditor key={id} job={selectedJob} jobs={jobs.map(row => ({ ...row, id: jobId(row) }))} id={id} address={jobAddress(selectedJob)} contact={tenant.name} phone={tenant.phone} note={draft.note} save={a => saveAppointment(selectedJob, a)} />}
              </div>
              <section ref={outcomePanelRef} className="fc-outcome-panel" aria-label="Visit outcome">
                <label>Outcome<select value={draft.outcome} onChange={(event) => setOutcomeDrafts((prev) => ({ ...prev, [id]: { ...draft, outcome: event.target.value } }))}><option value="">Select outcome</option>{Object.entries(FIELD_OUTCOMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>Visit note<textarea value={draft.note} rows={3} onChange={(event) => setOutcomeDrafts((prev) => ({ ...prev, [id]: { ...draft, note: event.target.value } }))} /></label>
                {draft.outcome === "APPOINTMENT_REQUESTED" ? <button type="button" className="fc-next-action" onClick={openAppointment}>Set appointment details</button> : <button type="button" className="fc-next-action" onClick={() => saveVisitOutcome(selectedJob, Boolean(draft.outcome))} disabled={Boolean(mediaBusy) || (!draft.outcome && !draft.note.trim())}>{draft.outcome ? "Save outcome & generate package" : "Save note"}</button>}
                {value(selectedJob, ["FieldOutcome", "fieldOutcome"]) ? (
                  <button type="button" className="fc-clear-outcome" data-hpd-smoke="fc-clear-outcome" onClick={() => clearOutcome(selectedJob)}>
                    Clear outcome ({FIELD_OUTCOMES[value(selectedJob, ["FieldOutcome", "fieldOutcome"])] || value(selectedJob, ["FieldOutcome", "fieldOutcome"])})
                  </button>
                ) : null}
                <p role="status">{outcomeMessage || "Device storage only. Appointment requests are not confirmed bookings."}</p>
                {Array.isArray(selectedJob.FieldVisitHistory) && selectedJob.FieldVisitHistory.length > 0 ? <details className="fc-visit-history"><summary>Visit history ({selectedJob.FieldVisitHistory.length})</summary><ol>{selectedJob.FieldVisitHistory.map((entry: { recordedAt?: string; outcome?: string; note?: string }, index: number) => <li key={index}><time>{entry.recordedAt ? formatSavedTime(entry.recordedAt) : "Date not recorded"}</time><strong>{FIELD_OUTCOMES[entry.outcome || ""] || "Visit note"}</strong><p>{entry.note}</p></li>)}</ol></details> : null}
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
            </div>
          );
        })() : null}
      </div>

      <PlanMyDayDrawer records={jobs} openRequest={plannerRequest} />
    </main>
  );
}
