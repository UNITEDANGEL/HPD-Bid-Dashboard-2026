"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FieldTabBar from "../../components/FieldTabBar";
import {
  applySavedWorkflowStatuses,
  paperworkOutcomeFromJob,
  paperworkQuery,
} from "../../lib/paperwork";

type JobRecord = Record<string, unknown>;
type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";
type StatusKey = "complete" | "noaccess" | "refused" | "pending" | "awarded" | "open";
type ViewMode = "map" | "list";

const BOROUGHS: { key: BoroughKey; label: string; center: [number, number]; color: string }[] = [
  { key: "MN", label: "Manhattan", center: [40.7831, -73.9712], color: "#0a84ff" },
  { key: "BK", label: "Brooklyn", center: [40.6782, -73.9442], color: "#30d158" },
  { key: "QN", label: "Queens", center: [40.7282, -73.7949], color: "#bf5af2" },
  { key: "BX", label: "Bronx", center: [40.8448, -73.8648], color: "#ff9f0a" },
  { key: "SI", label: "Staten Is.", center: [40.5795, -74.1502], color: "#ff453a" },
];

const STATUS_FILTERS: { key: "all" | StatusKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "complete", label: "Completed" },
  { key: "noaccess", label: "No Access" },
  { key: "refused", label: "Refused" },
  { key: "pending", label: "Pending" },
  { key: "awarded", label: "Awarded" },
  { key: "open", label: "Open" },
];

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

const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  complete: { label: "Completed", color: "#30d158" },
  noaccess: { label: "No Access", color: "#ff9f0a" },
  refused: { label: "Refused", color: "#ff453a" },
  pending: { label: "Pending", color: "#bf5af2" },
  awarded: { label: "Awarded", color: "#0a84ff" },
  open: { label: "Open", color: "#64d2ff" },
};

const NON_FIELD_SOURCE_STATUSES = new Set([
  "matched",
  "recovered drive itb",
  "recovered_drive_itb",
  "ok",
  "recovered",
  "nyc planning ok",
  "nyc_planning_ok",
]);

function value(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const item = job[key];
    if (item !== null && item !== undefined && String(item).trim()) return String(item).trim();
  }
  return "";
}

function numberValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const number = Number(job[key]);
    if (Number.isFinite(number)) return number;
  }
  return Number.NaN;
}

function jobId(job: JobRecord) {
  return value(job, ["OMO", "omo", "OMONumber", "id", "Id"]) || "HPD JOB";
}

function jobAddress(job: JobRecord) {
  return value(job, ["BuildingAddress", "Address", "address"]) || "Address not captured";
}

function jobLocation(job: JobRecord) {
  return value(job, ["ApartmentUnit", "ItbTenantApartment", "Location", "location"]);
}

function jobTenant(job: JobRecord) {
  return value(job, ["ItbTenantName", "TenantName", "tenantName"]);
}

function jobTenantPhone(job: JobRecord) {
  return value(job, ["ItbTenantPhone", "TenantPhone", "tenantPhone"]);
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

function normalizeStatusText(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function rawWorkflowStatus(job: JobRecord) {
  const explicit = value(job, [
    "WorkflowStatus",
    "workflowStatus",
    "FieldOutcome",
    "fieldOutcome",
    "StatusOverride",
    "JobStatus",
  ]);
  if (explicit) return explicit;
  const fallback = value(job, ["status", "Status"]);
  const normalized = normalizeStatusText(fallback);
  return NON_FIELD_SOURCE_STATUSES.has(normalized) ? "" : fallback;
}

function jobAwardAmount(job: JobRecord) {
  const raw = value(job, ["AwardAmount", "COAAwardAmount", "Amount", "amount"]);
  const amount = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function statusKey(job: JobRecord): StatusKey {
  const normalized = normalizeStatusText(rawWorkflowStatus(job));
  if (
    normalized.includes("work completed") ||
    normalized.includes("partial work completed") ||
    normalized.includes("completed by others") ||
    normalized === "completed" ||
    normalized === "complete"
  ) return "complete";
  if (normalized.includes("refused access") || normalized.includes("refused")) return "refused";
  if (normalized.includes("no access") || normalized.includes("waiting 72h") || normalized.includes("waiting 72")) return "noaccess";
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("award")) return "awarded";
  if (normalized.includes("open")) return "open";
  if (jobAwardAmount(job) > 0) return "awarded";
  return "open";
}

function jobStatusLabel(job: JobRecord) {
  return STATUS_META[statusKey(job)].label;
}

function jobLatLng(job: JobRecord) {
  const lat = numberValue(job, ["Latitude", "latitude", "Lat", "lat", "_lat"]);
  const lng = numberValue(job, ["Longitude", "longitude", "Lng", "lng", "Lon", "lon", "_lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 40 || lat > 41 || lng > -73 || lng < -75) return null;
  return { lat, lng };
}

function parseJobDate(input: unknown) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    const result = new Date(year, Number(slash[1]) - 1, Number(slash[2]));
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const result = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atLocalMidnight(input: Date) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function dateDifference(later: Date, earlier: Date) {
  return Math.round((atLocalMidnight(later).getTime() - atLocalMidnight(earlier).getTime()) / 86400000);
}

function jobMaturityDate(job: JobRecord) {
  return parseJobDate(value(job, ["MaturityDate", "WorkCompletionDate", "workCompletionDate", "Work Completion Date"]));
}

function jobStartDate(job: JobRecord) {
  return parseJobDate(value(job, ["WorkStartDate", "workStartDate", "Work Start Date"]));
}

function formatJobDate(input: Date | null) {
  if (!input) return "Not captured";
  return input.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

function daysToMaturity(job: JobRecord) {
  const maturity = jobMaturityDate(job);
  if (!maturity) return null;
  return dateDifference(maturity, new Date());
}

function contractDays(job: JobRecord) {
  const start = jobStartDate(job);
  const maturity = jobMaturityDate(job);
  if (!start || !maturity) return null;
  return dateDifference(maturity, start);
}

function maturityLabel(job: JobRecord) {
  const days = daysToMaturity(job);
  if (days === null) return "No maturity date";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function maturityTone(job: JobRecord) {
  const days = daysToMaturity(job);
  if (days === null) return "neutral";
  if (days < 0) return "danger";
  if (days <= 3) return "warning";
  return "good";
}

function boroughColor(key: BoroughKey | "NYC") {
  return BOROUGHS.find((borough) => borough.key === key)?.color || "#8e8e93";
}

function statusMarkerHtml(key: StatusKey) {
  const meta = STATUS_META[key];
  return `<div style="width:30px;height:30px;border-radius:50%;background:${meta.color};border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.48);display:grid;place-items:center;"><svg width="16" height="16" viewBox="0 0 24 24">${STATUS_ICON_PATHS[key]}</svg></div>`;
}

function directionsHref(job: JobRecord) {
  const coordinates = jobLatLng(job);
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : jobAddress(job);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}
function MenuIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
}
function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function ListIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
}
function MapIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 8 2 16 6 23 2 23 18 16 22 8 18 1 22 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;
}
function LocateIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
}
function LayersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
}

export default function FieldCommandClientV2() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const userLayerRef = useRef<any>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState<"all" | StatusKey>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [darkTiles, setDarkTiles] = useState(true);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadJobs() {
      setRefreshing(true);
      setLoadError("");
      try {
        const response = await fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rows: JobRecord[] = Array.isArray(data) ? data : data.jobs || data.data || data.records || [];
        const hydrated = await applySavedWorkflowStatuses(rows);
        if (!cancelled) {
          setJobs(hydrated);
          setLastSyncedAt(new Date());
        }
      } catch (error) {
        if (!cancelled) {
          setJobs([]);
          setLoadError(error instanceof Error ? error.message : "Unable to load jobs");
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }
    loadJobs();
    return () => { cancelled = true; };
  }, [refreshToken]);

  const selectedJob = useMemo(() => jobs.find((job) => jobId(job) === selectedId) || null, [jobs, selectedId]);
  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (borough !== "ALL" && jobBorough(job) !== borough) return false;
      if (status !== "all" && statusKey(job) !== status) return false;
      if (!query) return true;
      return [jobId(job), jobAddress(job), jobLocation(job), jobTenant(job), jobTenantPhone(job), jobBorough(job), jobStatusLabel(job), formatJobDate(jobMaturityDate(job)), maturityLabel(job)].join(" ").toLowerCase().includes(query);
    });
  }, [jobs, borough, status, search]);
  const sortedJobs = useMemo(() => [...filteredJobs].sort((a, b) => {
    const aDays = daysToMaturity(a);
    const bDays = daysToMaturity(b);
    if (aDays === null && bDays !== null) return 1;
    if (aDays !== null && bDays === null) return -1;
    if (aDays !== null && bDays !== null && aDays !== bDays) return aDays - bDays;
    return jobId(a).localeCompare(jobId(b));
  }), [filteredJobs]);
  const boroughCounts = useMemo(() => {
    const counts: Record<BoroughKey, number> = { MN: 0, BK: 0, QN: 0, BX: 0, SI: 0 };
    jobs.forEach((job) => { const key = jobBorough(job); if (key in counts) counts[key as BoroughKey] += 1; });
    return counts;
  }, [jobs]);
  const statusCounts = useMemo(() => {
    const counts: Record<StatusKey, number> = { complete: 0, noaccess: 0, refused: 0, pending: 0, awarded: 0, open: 0 };
    jobs.forEach((job) => { counts[statusKey(job)] += 1; });
    return counts;
  }, [jobs]);
  const activeJobs = useMemo(() => jobs.filter((job) => !["complete", "noaccess", "refused"].includes(statusKey(job))).length, [jobs]);
  const overdueCount = useMemo(() => jobs.filter((job) => { const days = daysToMaturity(job); return days !== null && days < 0 && statusKey(job) !== "complete"; }).length, [jobs]);
  const dueSoonCount = useMemo(() => jobs.filter((job) => { const days = daysToMaturity(job); return days !== null && days >= 0 && days <= 3 && statusKey(job) !== "complete"; }).length, [jobs]);
  const mappedFilteredCount = useMemo(() => filteredJobs.filter((job) => jobLatLng(job)).length, [filteredJobs]);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    document.body.style.background = "#05070c";
    return () => { document.body.style.background = previousBackground; };
  }, []);

  useEffect(() => {
    if (viewMode !== "map") return;
    let cancelled = false;
    async function drawMap() {
      if (!mapNode.current) return;
      const leafletModule = await import("leaflet");
      const L = (leafletModule as any).default || leafletModule;
      if (cancelled || !mapNode.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(mapNode.current, { zoomControl: false, attributionControl: false }).setView([40.72, -73.95], 10);
        tileLayerRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 20 }).addTo(mapRef.current);
        userLayerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      requestAnimationFrame(() => mapRef.current?.invalidateSize());
      if (layerRef.current) layerRef.current.clearLayers(); else layerRef.current = L.layerGroup().addTo(mapRef.current);
      const showPins = borough !== "ALL" || status !== "all" || search.trim().length > 0;
      if (showPins) {
        const bounds: [number, number][] = [];
        filteredJobs.forEach((job) => {
          const coordinates = jobLatLng(job);
          if (!coordinates) return;
          const key = statusKey(job);
          const marker = L.marker([coordinates.lat, coordinates.lng], { icon: L.divIcon({ className: "", html: statusMarkerHtml(key), iconSize: [30, 30], iconAnchor: [15, 15] }) });
          marker.bindTooltip(`${jobId(job)} · ${STATUS_META[key].label} · ${maturityLabel(job)}`, { direction: "top" });
          marker.on("click", () => setSelectedId(jobId(job)));
          marker.addTo(layerRef.current);
          bounds.push([coordinates.lat, coordinates.lng]);
        });
        if (bounds.length === 1) mapRef.current.setView(bounds[0], 15); else if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
        return;
      }
      const jobsByBorough: Record<BoroughKey, JobRecord[]> = { MN: [], BK: [], QN: [], BX: [], SI: [] };
      filteredJobs.forEach((job) => { const key = jobBorough(job); if (key in jobsByBorough) jobsByBorough[key as BoroughKey].push(job); });
      const bounds: [number, number][] = [];
      BOROUGHS.forEach(({ key, center, color }) => {
        const list = jobsByBorough[key];
        if (!list.length) return;
        const radius = Math.max(18, Math.min(48, 15 + Math.sqrt(list.length) * 6));
        const marker = L.circleMarker(center, { radius, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.66 });
        marker.bindTooltip(`${key} · ${list.length} jobs`, { direction: "top" });
        marker.on("click", () => setBorough(key));
        marker.addTo(layerRef.current);
        L.marker(center, { interactive: false, icon: L.divIcon({ className: "", html: `<div style="display:grid;place-items:center;width:100%;height:100%;color:#fff;font-weight:950;font-size:13px;text-shadow:0 1px 4px rgba(0,0,0,.8);">${list.length}</div>`, iconSize: [radius * 2, radius * 2] }) }).addTo(layerRef.current);
        bounds.push(center);
      });
      if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
    drawMap();
    return () => { cancelled = true; };
  }, [filteredJobs, borough, status, search, viewMode]);

  useEffect(() => {
    if (selectedId && !filteredJobs.some((job) => jobId(job) === selectedId)) setSelectedId("");
  }, [filteredJobs, selectedId]);
  useEffect(() => {
    if (locateStatus !== "error") return;
    const timer = window.setTimeout(() => setLocateStatus("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [locateStatus]);

  function toggleTileStyle() {
    setDarkTiles((previous) => {
      const next = !previous;
      tileLayerRef.current?.setUrl(next ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png");
      return next;
    });
  }
  function locateMe() {
    if (!navigator.geolocation) { setLocateStatus("error"); return; }
    setLocateStatus("loading");
    navigator.geolocation.getCurrentPosition(async (position) => {
      setLocateStatus("idle");
      if (!mapRef.current || !userLayerRef.current) return;
      const leafletModule = await import("leaflet");
      const L = (leafletModule as any).default || leafletModule;
      const { latitude, longitude } = position.coords;
      userLayerRef.current.clearLayers();
      const dot = L.divIcon({ className: "", html: '<div class="fc-you-are-here"><span class="fc-you-are-here-pulse"></span></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
      L.marker([latitude, longitude], { icon: dot, interactive: false }).addTo(userLayerRef.current);
      mapRef.current.setView([latitude, longitude], 15);
    }, () => setLocateStatus("error"), { enableHighAccuracy: true, timeout: 8000 });
  }

  const selectedStatus = selectedJob ? statusKey(selectedJob) : "open";
  const selectedOutcome = selectedJob ? paperworkOutcomeFromJob(selectedJob) : "pending";

  return (
    <main className="fc-app">
      <style jsx global>{`
        .fc-fetch-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(77,230,242,.42);background:linear-gradient(135deg,rgba(35,222,232,.2),rgba(10,132,255,.2));color:#b8f8ff;font-size:13px;font-weight:950;text-decoration:none}.fc-refresh-btn.is-busy svg{animation:fc-spin .85s linear infinite}@keyframes fc-spin{to{transform:rotate(360deg)}}.fc-command-health{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:0 16px 10px}.fc-command-health::-webkit-scrollbar{display:none}.fc-health-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.055);color:#aebbd0;font-size:12px;font-weight:800}.fc-health-chip strong{color:#fff}.fc-health-chip.is-danger strong{color:#ff6961}.fc-health-chip.is-warning strong{color:#ffb340}.fc-view-mode-btn.is-active{color:#64d2ff;border-color:rgba(100,210,255,.42)}.fc-list-panel{position:absolute;inset:0;z-index:470;overflow:auto;padding:12px 12px 164px;background:radial-gradient(circle at top right,rgba(55,223,235,.09),transparent 22rem),linear-gradient(180deg,rgba(4,10,19,.985),rgba(5,9,16,.985))}.fc-job-list{display:grid;gap:9px;max-width:880px;margin:0 auto}.fc-job-list-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:center;width:100%;padding:12px;border:1px solid rgba(255,255,255,.11);border-radius:17px;background:rgba(17,29,48,.88);color:#f8fbff;text-align:left;box-shadow:0 10px 24px rgba(0,0,0,.16)}.fc-list-status-dot{width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 4px rgba(255,255,255,.06)}.fc-job-list-copy{min-width:0}.fc-job-list-copy strong,.fc-job-list-copy span,.fc-job-list-copy small{display:block}.fc-job-list-copy strong{font-size:14px}.fc-job-list-copy span{margin-top:3px;overflow:hidden;color:#dbe7f6;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.fc-job-list-copy small{margin-top:4px;color:#8293aa;font-size:11px}.fc-job-list-maturity{text-align:right}.fc-job-list-maturity strong,.fc-job-list-maturity small{display:block}.fc-job-list-maturity strong{font-size:13px}.fc-job-list-maturity small{margin-top:3px;color:#8fa2ba;font-size:10px}.fc-job-list-maturity.is-danger strong,.fc-job-sheet-detail.is-danger strong{color:#ff6961}.fc-job-list-maturity.is-warning strong,.fc-job-sheet-detail.is-warning strong{color:#ffb340}.fc-job-list-maturity.is-good strong,.fc-job-sheet-detail.is-good strong{color:#53e69c}.fc-job-sheet-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.fc-job-sheet-detail{min-width:0;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.055)}.fc-job-sheet-detail span,.fc-job-sheet-detail strong{display:block}.fc-job-sheet-detail span{color:#8394aa;font-size:10px;font-weight:900;text-transform:uppercase}.fc-job-sheet-detail strong{margin-top:4px;color:#fff;font-size:13px;line-height:1.25}.fc-job-sheet-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fc-job-sheet-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:rgba(255,255,255,.07);color:#e9f3ff;font-weight:900;text-decoration:none}.fc-sync-copy{color:#7f91aa;font-size:11px}@media(min-width:760px){.fc-command-health{max-width:1100px;margin:0 auto;padding-left:24px;padding-right:24px}.fc-job-sheet-detail-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
      `}</style>
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text"><span className="fc-brand-icon">HPD</span><div className="fc-brand-copy"><p className="fc-eyebrow">Shield Command · HPD 2026</p><h1 className="fc-title">Field Command</h1></div></div>
          <div className="fc-topbar-actions">
            <Link href="/automation" className="fc-fetch-btn" aria-label="Open fetch and sync tools">Fetch / Sync</Link>
            <button type="button" className={`fc-icon-btn fc-refresh-btn ${refreshing ? "is-busy" : ""}`} aria-label="Refresh jobs and saved statuses" onClick={() => setRefreshToken((current) => current + 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
            <button type="button" className="fc-icon-btn" aria-label="Alerts"><BellIcon />{overdueCount ? <span className="fc-icon-badge">{Math.min(overdueCount,99)}</span> : null}</button>
            <Link href="/more" className="fc-icon-btn" aria-label="More tools"><MenuIcon /></Link>
          </div>
        </div>
        <div className="fc-live-row"><span className="fc-live-dot">Live</span><span className="fc-active-count">{activeJobs} Active Jobs</span><span className="fc-sync-copy">{lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Loading status overrides…"}</span></div>
      </header>
      <div className="fc-command-health" aria-label="Maturity summary"><span className="fc-health-chip"><strong>{jobs.length}</strong> total</span><span className="fc-health-chip is-danger"><strong>{overdueCount}</strong> overdue</span><span className="fc-health-chip is-warning"><strong>{dueSoonCount}</strong> due in 3 days</span><span className="fc-health-chip"><strong>{mappedFilteredCount}</strong> mapped in view</span>{loadError ? <span className="fc-health-chip is-danger"><strong>Load error</strong> {loadError}</span> : null}</div>
      <div className="fc-pill-row" role="group" aria-label="Borough filter"><button type="button" className={`fc-pill ${borough === "ALL" ? "is-active" : ""}`} onClick={() => setBorough("ALL")}><strong>All</strong><span>{jobs.length}</span></button>{BOROUGHS.map(({key}) => <button key={key} type="button" className={`fc-pill fc-${key.toLowerCase()} ${borough === key ? "is-active" : ""}`} onClick={() => setBorough(key)}><strong>{key}</strong><span>{boroughCounts[key]}</span></button>)}</div>
      <div className="fc-pill-row fc-status-pill-row" role="group" aria-label="Status filter">{STATUS_FILTERS.map(({key,label}) => <button key={key} type="button" className={`fc-pill ${status === key ? "is-active" : ""}`} onClick={() => setStatus(key)}><strong>{label}</strong><span>{key === "all" ? jobs.length : statusCounts[key]}</span></button>)}</div>
      <div className="fc-search-row"><div className="fc-search-field"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search OMO, address, tenant, maturity…" aria-label="Search jobs" /></div><button type="button" className={`fc-search-list-btn fc-view-mode-btn ${viewMode === "list" ? "is-active" : ""}`} aria-label={viewMode === "map" ? "View as list" : "View as map"} onClick={() => setViewMode((mode) => mode === "map" ? "list" : "map")}>{viewMode === "map" ? <ListIcon /> : <MapIcon />}</button></div>
      <div className="fc-map-wrap">
        <div ref={mapNode} className="fc-map-node" />
        {viewMode === "list" ? <div className="fc-list-panel"><div className="fc-job-list">{sortedJobs.map((job) => { const key=statusKey(job); const tone=maturityTone(job); return <button type="button" className="fc-job-list-row" key={jobId(job)} onClick={() => setSelectedId(jobId(job))}><span className="fc-list-status-dot" style={{background:STATUS_META[key].color}}/><span className="fc-job-list-copy"><strong>{jobId(job)} · {STATUS_META[key].label}</strong><span>{jobAddress(job)}</span><small>{jobLocation(job) || jobTenant(job) || jobBorough(job)}</small></span><span className={`fc-job-list-maturity is-${tone}`}><strong>{maturityLabel(job)}</strong><small>{formatJobDate(jobMaturityDate(job))}</small></span></button>; })}{!sortedJobs.length ? <p className="fc-map-hint">No jobs match these filters.</p> : null}</div></div> : null}
        {viewMode === "map" ? <><div className="fc-map-controls"><button type="button" className={`fc-map-fab ${locateStatus === "loading" ? "is-busy" : ""}`} aria-label="Locate me" onClick={locateMe}><LocateIcon /></button><button type="button" className={`fc-map-fab ${darkTiles ? "is-active" : ""}`} aria-label="Toggle map style" onClick={toggleTileStyle}><LayersIcon /></button></div><div className="fc-visible-badge"><strong>{filteredJobs.length}</strong><span>Visible Jobs</span></div>{locateStatus === "error" ? <p className="fc-map-hint fc-map-hint-warn">Couldn&apos;t get your location</p> : null}{filteredJobs.length > 0 && !mappedFilteredCount ? <p className="fc-map-hint">No mapped jobs match these filters</p> : null}{!filteredJobs.length ? <p className="fc-map-hint">No jobs match these filters</p> : null}{(borough !== "ALL" || status !== "all" || search.trim()) && !selectedJob ? <div className="fc-legend">{(Object.keys(STATUS_META) as StatusKey[]).map((key) => <span key={key} className="fc-legend-chip"><span className="fc-legend-dot" style={{background:STATUS_META[key].color}} dangerouslySetInnerHTML={{__html:`<svg width="10" height="10" viewBox="0 0 24 24">${STATUS_ICON_PATHS[key]}</svg>`}}/>{STATUS_META[key].label}</span>)}</div> : null}</> : null}
        {selectedJob ? <div className="fc-job-sheet"><button type="button" className="fc-job-sheet-close" aria-label="Close" onClick={() => setSelectedId("")}>&times;</button><div className="fc-job-sheet-tags"><span className="fc-job-sheet-tag" style={{background:boroughColor(jobBorough(selectedJob))}}>{jobBorough(selectedJob)}</span><span className="fc-job-sheet-tag" style={{background:STATUS_META[selectedStatus].color}}>{STATUS_META[selectedStatus].label}</span></div><strong className="fc-job-sheet-id">{jobId(selectedJob)}</strong><p className="fc-job-sheet-address">{jobAddress(selectedJob)}</p>{jobLocation(selectedJob) || jobTenant(selectedJob) ? <div className="fc-job-sheet-meta">{jobLocation(selectedJob) ? <span>Location {jobLocation(selectedJob)}</span> : null}{jobTenant(selectedJob) ? <span>{jobTenant(selectedJob)}</span> : null}{jobTenantPhone(selectedJob) ? <span>{jobTenantPhone(selectedJob)}</span> : null}</div> : null}<div className="fc-job-sheet-detail-grid"><div className="fc-job-sheet-detail"><span>Maturity Date</span><strong>{formatJobDate(jobMaturityDate(selectedJob))}</strong></div><div className={`fc-job-sheet-detail is-${maturityTone(selectedJob)}`}><span>Time</span><strong>{maturityLabel(selectedJob)}</strong></div><div className="fc-job-sheet-detail"><span>Contract Days</span><strong>{contractDays(selectedJob) ?? "—"}</strong></div><div className="fc-job-sheet-detail"><span>Award</span><strong>{jobAwardAmount(selectedJob) ? `$${jobAwardAmount(selectedJob).toLocaleString()}` : "—"}</strong></div></div><div className="fc-job-sheet-actions"><a className="fc-job-sheet-action" href={directionsHref(selectedJob)} target="_blank" rel="noreferrer">Directions</a><Link className="fc-job-sheet-secondary" href={`/paperwork?${paperworkQuery(selectedJob, selectedOutcome)}`}>Paperwork</Link></div></div> : null}
      </div>
      <FieldTabBar />
    </main>
  );
}
