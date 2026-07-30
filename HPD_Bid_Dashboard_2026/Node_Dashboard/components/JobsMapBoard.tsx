"use client";

import dynamic from "next/dynamic";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { JobRecord } from "../lib/types";
import { isMainMapStatus } from "../lib/workflow";
import { compareJobsBySearch, matchesJobSearch } from "../lib/search";

type Props = {
  jobs: JobRecord[];
};

type StatusView = "All" | "Open" | "Awarded" | "Pending";
type TableMode = "live" | "queue" | "documents";
type ActivePanel = "" | "filters" | "notifications" | "account" | "map" | "system" | "contact" | "jobs" | "add";
type ChartPeriod = "Last 12 Months" | "2026 YTD" | "Last 90 Days";

const STATUS_OVERRIDE_STORAGE_KEY = "hpd-job-status-overrides-v1";
const CHART_PERIODS: ChartPeriod[] = ["Last 12 Months", "2026 YTD", "Last 90 Days"];
const NYC_BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const FIELD_STATUS_ACTIONS = [
  { label: "Arrived", value: "Arrived" },
  { label: "Started", value: "Started" },
  { label: "Progress", value: "Work In Progress" },
  { label: "Complete", value: "Work Completed" },
  { label: "No Access", value: "No Access - 1st Attempt" },
] as const;
const BOROUGH_CENTERS: Record<string, [number, number]> = {
  Manhattan: [40.7831, -73.9712],
  Brooklyn: [40.6782, -73.9442],
  Queens: [40.7282, -73.7949],
  Bronx: [40.8448, -73.8648],
  "Staten Island": [40.5795, -74.1502],
};

const JobsMap = dynamic(
  () => import("./JobsMap").then((mod) => mod.JobsMap),
  {
    ssr: false,
    loading: () => <div className="map-skeleton">Loading live job map...</div>,
  },
);

const NAV_ITEMS = [
  ["Overview", "grid"],
  ["Live Bids", "doc"],
  ["ITB / COA", "stack"],
  ["Field Map", "pin"],
  ["Automation", "gear"],
  ["Documents", "file"],
  ["Reports", "report"],
  ["System Status", "gear"],
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatCurrency(amountValue: number, fallback: string) {
  if (!amountValue) return fallback || "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountValue);
}

function realFieldValue(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(not listed|not available|date unavailable|n\/a|na|none|null|unknown|tenant name|john doe)$/i.test(text)) return "";
  return text;
}

function usableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year < 2000 || year > 2030) return null;
  return date;
}

function formatShortDate(value: string) {
  const date = usableDate(value);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function activityStamp(job: JobRecord) {
  return formatShortDate(job.awardDate);
}

function formatJobStartDate(job: JobRecord) {
  return formatShortDate(job.startDate || job.awardDate);
}

function formatJobCompletionDate(job: JobRecord) {
  return formatShortDate(job.completionDate);
}

function displayStatus(job: JobRecord) {
  if (!job.status || isMainMapStatus(job.status)) return "Open";
  return job.status;
}

function jobTitle(job: JobRecord) {
  const text = `${job.trade || ""} ${job.description || ""}`.toLowerCase();
  if (text.includes("plumb")) return "Plumbing Repairs";
  if (text.includes("paint")) return "Interior Painting";
  if (text.includes("elect")) return "Electrical Repairs";
  if (text.includes("carp")) return "Carpentry Repairs";
  if (text.includes("floor")) return "Flooring Repairs";
  if (text.includes("clean")) return "Cleaning Repairs";
  if (text.includes("door")) return "Door Repairs";
  if (text.includes("secure") || text.includes("post")) return "Security Repairs";
  return "Stairwell Repairs";
}

function statusMatches(job: JobRecord, status: StatusView) {
  const rawStatus = String(job.status || "").trim().toLowerCase();
  const normalized = displayStatus(job).toLowerCase();
  if (status === "All") return true;
  if (status === "Open") {
    return (
      normalized === "open" ||
      rawStatus.includes("arrived") ||
      rawStatus.includes("started") ||
      rawStatus.includes("work in progress") ||
      rawStatus.includes("no access") ||
      rawStatus.includes("partial")
    );
  }
  return normalized.includes(status.toLowerCase()) || rawStatus.includes(status.toLowerCase());
}

function boroughCode(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("brooklyn")) return "BK";
  if (normalized.includes("manhattan")) return "MN";
  if (normalized.includes("queens")) return "QN";
  if (normalized.includes("bronx")) return "BX";
  if (normalized.includes("staten")) return "SI";
  return name.slice(0, 2).toUpperCase();
}

function boroughClassName(name: string) {
  const code = boroughCode(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `mobile-borough-${code}`;
}

function shortBoroughLabel(name: string) {
  if (name === "Staten Island") return "Staten Is.";
  return name;
}

function boroughDotClass(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("manhattan")) return "dot-manhattan";
  if (normalized.includes("brooklyn")) return "dot-brooklyn";
  if (normalized.includes("queens")) return "dot-queens";
  if (normalized.includes("bronx")) return "dot-bronx";
  if (normalized.includes("staten")) return "dot-staten";
  return "dot-default";
}

function canonicalBorough(name: string) {
  const normalized = name.toLowerCase();
  return NYC_BOROUGHS.find((boroughName) => boroughName.toLowerCase() === normalized) || name;
}

function jobDetailHref(job: JobRecord) {
  return `/jobs/${encodeURIComponent(job.id)}`;
}

function mapsHref(job: JobRecord) {
  const query = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : job.address || job.location;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function phoneHref(job: JobRecord) {
  const cleaned = String(job.tenantPhone || "").replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function csvValue(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function jobsToCsv(records: JobRecord[]) {
  const headers = ["OMO", "Address", "Borough", "Status", "COA Award", "Start Date", "Completion Date", "Trade"];
  const rows = records.map((job) => [
    job.id,
    job.address || "",
    job.borough || "",
    displayStatus(job),
    formatCurrency(job.amountValue, job.bidAmount),
    formatJobStartDate(job),
    formatJobCompletionDate(job),
    job.trade || "",
  ]);

  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}

function trendPoints(total: number) {
  const base = Math.max(12, Math.round(total / 8));
  return [base, base + 44, base + 45, base + 96, base + 136, base + 70, base + 43, base + 66, base + 94, base + 137, base + 74];
}

function sparklinePath(values: number[]) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return values
    .map((value, index) => {
      const x = 20 + index * 34;
      const y = 175 - ((value - min) / Math.max(1, max - min)) * 140;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function JobsMapBoard({ jobs }: Props) {
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("");
  const [statusView, setStatusView] = useState<StatusView>("All");
  const [selectedId, setSelectedId] = useState("");
  const [activeNav, setActiveNav] = useState("Overview");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("Last 12 Months");
  const [tableMode, setTableMode] = useState<TableMode>("live");
  const [activePanel, setActivePanel] = useState<ActivePanel>("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoUrlsByJob, setPhotoUrlsByJob] = useState<Record<string, string[]>>({});
  const [jobStatusOverrides, setJobStatusOverrides] = useState<Record<string, string>>({});
  const [mapFitNonce, setMapFitNonce] = useState(0);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const mobileBoroughRowRef = useRef<HTMLDivElement>(null);
  const jobSheetTouchStartY = useRef<number | null>(null);

  const effectiveJobs = useMemo(
    () => jobs.map((job) => {
      const override = realFieldValue(jobStatusOverrides[job.id] || "");
      if (!override) return job;
      return {
        ...job,
        status: override,
        statusOverride: override,
        workflowStatus: override,
      };
    }),
    [jobStatusOverrides, jobs],
  );
  const mappableJobs = useMemo(() => effectiveJobs.filter((job) => job.hasMap), [effectiveJobs]);
  const boroughs = useMemo(() => {
    const dataBoroughs = unique(mappableJobs.map((job) => job.borough));
    return [
      ...NYC_BOROUGHS,
      ...dataBoroughs.filter((name) => !NYC_BOROUGHS.some((boroughName) => boroughName.toLowerCase() === name.toLowerCase())),
    ];
  }, [mappableJobs]);
  const totalAwardValue = useMemo(
    () => effectiveJobs.reduce((sum, job) => sum + (Number.isFinite(job.amountValue) ? job.amountValue : 0), 0),
    [effectiveJobs],
  );
  const coaCount = effectiveJobs.filter((job) => job.coaFile).length;
  const itbCount = effectiveJobs.filter((job) => job.itbFile).length;

  const filtered = mappableJobs
    .filter((job) => {
      if (borough && job.borough !== borough) return false;
      if (!statusMatches(job, statusView)) return false;
      return matchesJobSearch(job, query);
    })
    .sort(compareJobsBySearch(query));

  const selected = selectedId ? filtered.find((job) => job.id === selectedId) || mappableJobs.find((job) => job.id === selectedId) || null : null;
  const queuedRows = filtered.filter((job) => !job.coaFile || !job.itbFile || displayStatus(job).toLowerCase().includes("pending"));
  const documentRows = filtered.filter((job) => job.coaFile || job.itbFile);
  const tableSource = tableMode === "queue" ? queuedRows : tableMode === "documents" ? documentRows : filtered;
  const tableRows = tableSource.slice(0, 7);
  const activityRows = filtered.slice(0, 6);
  const savedJobs = effectiveJobs.filter((job) => savedIds.includes(job.id));
  const selectedIndex = selected ? filtered.findIndex((job) => job.id === selected.id) : -1;
  const selectedMapsHref = selected ? mapsHref(selected) : "";
  const selectedPhoneHref = selected ? phoneHref(selected) : "";
  const selectedDetailHref = selected ? jobDetailHref(selected) : "#";
  const isSelectedSaved = Boolean(selected && savedIds.includes(selected.id));
  const selectedPhotoUrls = selected ? photoUrlsByJob[selected.id] || [] : [];
  const selectedPhotoUrl = selectedPhotoUrls[0] || "";
  const selectedStatus = selected ? displayStatus(selected) : "";
  const selectedAddress = selected ? realFieldValue(selected.address) : "";
  const selectedBorough = selected ? realFieldValue(selected.borough) : "";
  const selectedTrade = selected ? realFieldValue(selected.trade) : "";
  const selectedStartDate = selected ? realFieldValue(formatJobStartDate(selected)) : "";
  const selectedCompletionDate = selected ? realFieldValue(formatJobCompletionDate(selected)) : "";
  const selectedAmount = selected ? realFieldValue(formatCurrency(selected.amountValue, selected.bidAmount)) : "";
  const selectedTenantName = selected ? realFieldValue(selected.tenantName) : "";
  const selectedLocation = selected ? realFieldValue(selected.location) : "";
  const selectedDetailItems = [
    selectedStatus ? { label: "Status", value: selectedStatus, icon: "status-mini-icon" } : null,
    selectedStartDate ? { label: "Start Date", value: selectedStartDate, icon: "calendar-icon" } : null,
    selectedCompletionDate ? { label: "Completion", value: selectedCompletionDate, icon: "calendar-icon" } : null,
    selectedAmount ? { label: "COA Amount", value: selectedAmount, icon: "money-mini-icon" } : null,
    selectedTenantName ? { label: "Tenant", value: selectedTenantName, icon: "tenant-icon" } : null,
    selectedLocation ? { label: "Location", value: selectedLocation, icon: "tenant-icon" } : null,
  ].filter((item): item is { label: string; value: string; icon: string } => Boolean(item)).slice(0, 4);
  const exportDataHref = `data:text/csv;charset=utf-8,${encodeURIComponent(jobsToCsv(filtered))}`;
  const exportFileName = `hpd-bids-${new Date().toISOString().slice(0, 10)}.csv`;
  const mapFocusKey = `${borough || "All"}|${statusView}|${query}|${mapFitNonce}|${userLocation ? userLocation.join(",") : ""}`;
  const boroughFocusCenter = borough ? BOROUGH_CENTERS[canonicalBorough(borough)] || null : null;
  const mapFocusCenter = userLocation || boroughFocusCenter;
  const mapFocusZoom = userLocation ? 15 : undefined;
  const mobileBoroughStats = [
    { key: "", label: "All", count: mappableJobs.length },
    ...NYC_BOROUGHS.map((name) => ({
      key: name,
      label: shortBoroughLabel(name),
      count: mappableJobs.filter((job) => job.borough === name).length,
    })),
  ];
  const mobileStatusBase = mappableJobs
    .filter((job) => !borough || job.borough === borough)
    .filter((job) => matchesJobSearch(job, query));
  const mobileStatusStats = (["All", "Open", "Awarded", "Pending"] as StatusView[]).map((status) => ({
    status,
    count: status === "All" ? mobileStatusBase.length : mobileStatusBase.filter((job) => statusMatches(job, status)).length,
  }));
  const alertCount = Math.min(activityRows.length, 9);
  const boroughCounts = boroughs
    .map((name) => ({
      name,
      code: boroughCode(name),
      count: mappableJobs.filter((job) => job.borough === name).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const chartTotal = chartPeriod === "2026 YTD"
    ? effectiveJobs.filter((job) => job.awardDate.includes("2026")).length
    : chartPeriod === "Last 90 Days"
      ? Math.max(1, Math.round(effectiveJobs.length / 4))
      : effectiveJobs.length;
  const trend = trendPoints(chartTotal);
  const trendPath = sparklinePath(trend);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STATUS_OVERRIDE_STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Record<string, string>;
      const cleaned = Object.fromEntries(
        Object.entries(parsed)
          .map(([id, status]) => [id, realFieldValue(status)] as const)
          .filter(([id, status]) => Boolean(id && status)),
      );
      setJobStatusOverrides(cleaned);
    } catch {
      setJobStatusOverrides({});
    }
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".desktop-search input, .mobile-search input")?.focus();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    const activeKey = borough || "__all__";
    const row = mobileBoroughRowRef.current;
    const activeChip = Array.from(row?.querySelectorAll<HTMLButtonElement>("[data-borough-chip]") || [])
      .find((button) => button.dataset.boroughChip === activeKey);

    activeChip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [borough]);

  useEffect(() => {
    if (!selected || photoUrlsByJob[selected.id]) return;

    let active = true;
    fetch(`/api/jobs/images?id=${encodeURIComponent(selected.id)}`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { ok?: boolean; files?: Array<{ url: string }> };
        if (!active || !data.ok) return;
        setPhotoUrlsByJob((current) => (
          current[selected.id]
            ? current
            : { ...current, [selected.id]: (data.files || []).map((file) => file.url).filter(Boolean) }
        ));
      })
      .catch(() => {
        if (!active) return;
        setPhotoUrlsByJob((current) => ({ ...current, [selected.id]: [] }));
      });

    return () => {
      active = false;
    };
  }, [photoUrlsByJob, selected]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function resetFilters() {
    setQuery("");
    setBorough("");
    setStatusView("All");
    setSelectedId("");
    setUserLocation(null);
    notify("Filters reset.");
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showTable(mode: TableMode) {
    setTableMode(mode);
    setActivePanel("");
    window.setTimeout(() => scrollToSection("live-bids-table"), 0);
  }

  function cycleChartPeriod() {
    const current = CHART_PERIODS.indexOf(chartPeriod);
    setChartPeriod(CHART_PERIODS[(current + 1) % CHART_PERIODS.length]);
  }

  function selectBorough(name: string) {
    setSelectedId("");
    setQuery("");
    setUserLocation(null);
    setBorough((current) => (current === name ? "" : name));
  }

  function fitVisibleMap() {
    setSelectedId("");
    setActivePanel("");
    setUserLocation(null);
    setMapFitNonce((current) => current + 1);
  }

  function locateUser() {
    setSelectedId("");
    setActivePanel("");

    if (!navigator.geolocation) {
      notify("Location is not available in this browser.");
      return;
    }

    notify("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setMapFitNonce((current) => current + 1);
        notify("Location found.");
      },
      () => {
        notify("Allow location permission to show where you are.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  function selectStatus(status: StatusView) {
    setSelectedId("");
    setStatusView(status);
  }

  function updateSelectedStatus(nextStatus: string) {
    if (!selected) return;

    const jobId = selected.id;
    setJobStatusOverrides((current) => {
      const next = { ...current, [jobId]: nextStatus };
      try {
        window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the on-screen update even if browser storage is unavailable.
      }
      return next;
    });

    if (!statusMatches({ ...selected, status: nextStatus, statusOverride: nextStatus, workflowStatus: nextStatus }, statusView)) {
      setStatusView("All");
    }

    notify(`${jobId} marked ${nextStatus}.`);

    void fetch("/api/jobs/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: jobId, status: nextStatus }),
    }).catch(() => undefined);
  }

  function exportFilteredJobs() {
    const blob = new Blob([jobsToCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `hpd-bids-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    notify(`${filtered.length} records exported.`);
  }

  function handleNav(label: string) {
    setActiveNav(label);

    if (label === "Overview") {
      resetFilters();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (label === "Live Bids") {
      showTable("live");
    } else if (label === "ITB / COA") {
      showTable("documents");
    } else if (label === "Field Map") {
      scrollToSection("live-map-preview");
    } else if (label === "Automation") {
      showTable("queue");
    } else if (label === "Documents" && selected) {
      window.location.href = selectedDetailHref;
    } else if (label === "Reports") {
      exportFilteredJobs();
    } else if (label === "System Status") {
      setActivePanel("system");
    }
  }

  function selectRelativeJob(direction: 1 | -1) {
    if (!filtered.length) return;
    const currentIndex = selectedIndex < 0 ? 0 : selectedIndex;
    const nextIndex = (currentIndex + direction + filtered.length) % filtered.length;
    setSelectedId(filtered[nextIndex].id);
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(event.currentTarget.files || []);
    if (!selected || !files.length) return;

    const formData = new FormData();
    formData.append("id", selected.id);
    files.forEach((file) => formData.append("photos", file));

    setUploadingPhotos(true);
    try {
      const response = await fetch("/api/jobs/images", {
        method: "POST",
        body: formData,
      });
      const data = await response.json() as { ok?: boolean; error?: string; files?: Array<{ url: string }> };
      if (!response.ok || !data.ok) throw new Error(data.error || "Upload failed");
      const uploadedUrls = (data.files || []).map((file) => file.url).filter(Boolean);
      setPhotoUrlsByJob((current) => ({
        ...current,
        [selected.id]: [...uploadedUrls, ...(current[selected.id] || [])],
      }));
      notify(`${uploadedUrls.length} photo${uploadedUrls.length === 1 ? "" : "s"} saved for ${selected.id}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save photos.");
    } finally {
      setUploadingPhotos(false);
      input.value = "";
    }
  }

  const panelTitles: Record<Exclude<ActivePanel, "">, string> = {
    filters: "Filters",
    notifications: "Recent Activity",
    account: "Account Tools",
    map: "Expanded Map",
    system: "System Status",
    contact: "Job Contact",
    jobs: "Visible Jobs",
    add: "Quick Actions",
  };
  const panelTitle = activePanel ? panelTitles[activePanel] : "";
  const systemReport = [
    "HPD Bid Dashboard 2026",
    `Generated: ${new Date().toLocaleString()}`,
    `Loaded jobs: ${jobs.length}`,
    `Mapped jobs: ${mappableJobs.length}`,
    `Filtered jobs: ${filtered.length}`,
    `ITB files: ${itbCount}`,
    `COA awards: ${coaCount}`,
    `Command queue: ${queuedRows.length}`,
  ].join("\n");
  const trimmedQuery = query.trim();
  const emptyMapScope = borough || (statusView !== "All" ? statusView : trimmedQuery ? "Search" : "No results");
  const emptyMapTitle = borough ? "No mapped jobs here" : "No mapped jobs match";
  const emptyMapMessage = borough
    ? statusView === "All" && !trimmedQuery
      ? `The map is centered on ${borough}, but no jobs in the current data have coordinates there.`
      : `The map is centered on ${borough}, but no jobs match the active filters.`
    : "Try another status, borough, or search term to bring jobs back onto the map.";

  return (
    <main className="command-app">
      <section className="desktop-dashboard">
        <aside className="command-sidebar">
          <div className="sidebar-brand">
            <div className="brand-tile">HPD</div>
            <div>
              <strong>HPD Bid Dashboard</strong>
              <span>2026 Command Center</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Dashboard navigation">
            {NAV_ITEMS.map(([label, icon]) => (
              <button
                key={label}
                className={label === activeNav ? "is-active" : ""}
                type="button"
                onClick={() => handleNav(label)}
              >
                <span className={`nav-icon nav-${icon}`} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          <div className="sidebar-map-card">
            <span>Map Preview</span>
            <strong>{mappableJobs.length}</strong>
            <p>Jobs with coordinates ready for field routing.</p>
            <button
              type="button"
              onClick={() => {
                selectStatus("Open");
                scrollToSection("live-map-preview");
              }}
            >
              Open live map
              <span aria-hidden="true">↗</span>
            </button>
          </div>

          <div className="sidebar-profile">
            <div className="avatar">HPD</div>
            <div>
              <strong>Live Session</strong>
              <span>{jobs.length} records loaded</span>
            </div>
            <span aria-hidden="true">⌄</span>
          </div>
        </aside>

        <div className="command-main">
          <header className="command-topbar">
            <div>
              <h1>HPD Bid Command Center</h1>
              <p>{jobs.length} bid records loaded from the project data.</p>
            </div>
            <label className="desktop-search">
              <span aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setSelectedId("");
                  setQuery(event.target.value);
                }}
                aria-label="Search jobs"
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-actions">
              <button type="button" aria-label="Open filters" className="icon-button sliders-icon" onClick={() => setActivePanel("filters")} />
              <button type="button" aria-label="Notifications" className="icon-button bell-icon" onClick={() => setActivePanel("notifications")}>
                <span>{activityRows.length}</span>
              </button>
              <button type="button" className="account-switcher" onClick={() => setActivePanel("account")}>
                <span className="account-logo">HPD</span>
                <span>
                  <strong>Project Workspace</strong>
                  <small>{mappableJobs.length} mapped jobs</small>
                </span>
                <span aria-hidden="true">⌄</span>
              </button>
            </div>
          </header>

          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-icon pulse-icon" aria-hidden="true" />
              <div>
                <small>Live Bids</small>
                <strong>{jobs.length}</strong>
                <p>Active opportunities</p>
                <button type="button" onClick={() => showTable("live")}>View all</button>
              </div>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon doc-icon" aria-hidden="true" />
              <div>
                <small>ITB Files</small>
                <strong>{itbCount}</strong>
                <p>Total ITB files</p>
                <button type="button" onClick={() => showTable("documents")}>View all</button>
              </div>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon award-icon" aria-hidden="true" />
              <div>
                <small>COA Awards</small>
                <strong>{coaCount}</strong>
                <p>Total COA awards</p>
                <button type="button" onClick={() => showTable("documents")}>View all</button>
              </div>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon money-icon" aria-hidden="true" />
              <div>
                <small>Total COA Awards</small>
                <strong>{formatCurrency(totalAwardValue, "")}</strong>
                <p>Total awarded value</p>
                <button type="button" onClick={exportFilteredJobs}>Export</button>
              </div>
            </div>
          </div>

          <div className="analytics-grid">
            <section className="panel chart-panel">
              <div className="panel-head">
                <h2>Bids over time</h2>
                <button type="button" onClick={cycleChartPeriod}>
                  {chartPeriod}
                </button>
              </div>
              <svg viewBox="0 0 420 220" role="img" aria-label="Bids over time chart">
                <defs>
                  <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2f9cff" stopOpacity="0.34" />
                    <stop offset="100%" stopColor="#2f9cff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[35, 70, 105, 140, 175].map((y) => (
                  <line key={y} x1="20" x2="388" y1={y} y2={y} />
                ))}
                <path d={`${trendPath} L 360 190 L 20 190 Z`} className="chart-area" />
                <path d={trendPath} className="chart-line" />
                {trend.map((value, index) => {
                  const max = Math.max(...trend);
                  const min = Math.min(...trend);
                  const x = 20 + index * 34;
                  const y = 175 - ((value - min) / Math.max(1, max - min)) * 140;
                  return <circle key={`${value}-${index}`} cx={x} cy={y} r="5" />;
                })}
              </svg>
            </section>

            <section className="panel borough-panel">
              <h2>Bids by borough</h2>
              <div className="borough-list">
                {boroughCounts.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => selectBorough(item.name)}
                    className={item.name === borough ? "is-active" : ""}
                  >
                    <span className={`dot dot-${index}`} />
                    <strong>{item.code}</strong>
                    <span>{item.count}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel map-preview-panel" id="live-map-preview">
              <div className="panel-head">
                <h2>Map preview</h2>
                <button type="button" aria-label="Expand map" className="expand-icon" onClick={() => setActivePanel("map")} />
              </div>
              <div className="desktop-map-frame">
                <JobsMap
                  jobs={filtered.slice(0, 120)}
                  selectedId={selected?.id || ""}
                  onSelect={setSelectedId}
                  focusCenter={mapFocusCenter}
                  focusZoom={mapFocusZoom}
                  focusKey={mapFocusKey}
                  userLocation={userLocation}
                />
              </div>
            </section>

            <section className="panel activity-panel">
              <div className="panel-head">
                <h2>Recent activity</h2>
                <button type="button" onClick={() => scrollToSection("live-bids-table")}>View all</button>
              </div>
              <div className="activity-list">
                {activityRows.map((job, index) => (
                  <button key={`${job.id}-activity`} type="button" onClick={() => setSelectedId(job.id)}>
                    <span className="omo-bubble">OMO</span>
                    <span>
                      <strong>{job.id}</strong>
                      <small>{job.address || "No address listed"}</small>
                    </span>
                    <StatusBadge status={displayStatus(job)} />
                    <time>{activityStamp(job)}</time>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="panel table-panel" id="live-bids-table">
            <div className="table-toolbar">
              <div className="table-tabs">
                <button type="button" className={tableMode === "live" ? "is-active" : ""} onClick={() => setTableMode("live")}>Live bids table</button>
                <button type="button" className={tableMode === "queue" ? "is-active" : ""} onClick={() => setTableMode("queue")}>Command queue</button>
                <button type="button" className={tableMode === "documents" ? "is-active" : ""} onClick={() => setTableMode("documents")}>Documents</button>
              </div>
              <div>
                <span>{tableSource.length} records</span>
                <a
                  href={exportDataHref}
                  download={exportFileName}
                  onClick={() => notify(`${filtered.length} records exported.`)}
                >
                  Export
                </a>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>OMO</th>
                    <th>Address</th>
                    <th>Borough</th>
                    <th>Status</th>
                    <th>COA Award</th>
                    <th>Start Date</th>
                    <th>Completion Date</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((job) => (
                    <tr
                      key={`${job.id}-table`}
                      className={selected?.id === job.id ? "is-selected" : ""}
                      onClick={() => setSelectedId(job.id)}
                    >
                      <td>{job.id}</td>
                      <td>{job.address || "No address listed"}</td>
                      <td>{job.borough || "Unknown"}</td>
                      <td><StatusBadge status={displayStatus(job)} /></td>
                      <td>{formatCurrency(job.amountValue, job.bidAmount)}</td>
                      <td>{formatJobStartDate(job)}</td>
                      <td>{formatJobCompletionDate(job)}</td>
                      <td>
                        <a
                          href={jobDetailHref(job)}
                          className="row-more"
                          aria-label={`Open ${job.id} details`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          ⋮
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!tableRows.length ? (
                    <tr className="empty-table-row">
                      <td colSpan={8}>
                        No records match the current filters.
                        <button type="button" onClick={resetFilters}>Reset filters</button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section className="mobile-field">
        <header className="mobile-command-card">
          <div className="mobile-command-brand">
            <div className="mobile-hpd-shield" aria-hidden="true">
              <strong>HPD</strong>
              <span />
            </div>
            <div>
              <p>HPD Bid Dashboard 2026</p>
              <h1>Field Command</h1>
              <span className="mobile-live-line">
                <i aria-hidden="true" />
                Live
                <small>{jobs.length} Active Jobs</small>
              </span>
            </div>
          </div>
          <div className="mobile-command-actions">
            <button type="button" className="mobile-notify-button bell-icon" aria-label="Open alerts" onClick={() => setActivePanel("notifications")}>
              <span>{alertCount}</span>
            </button>
            <button type="button" className="mobile-menu-button menu-lines-icon" aria-label="Open menu" onClick={() => setActivePanel("filters")} />
          </div>
        </header>

        <div ref={mobileBoroughRowRef} className="mobile-borough-tabs" aria-label="Borough filters">
          {mobileBoroughStats.map((item) => {
            const active = item.key ? item.key === borough : !borough;
            return (
              <button
                key={item.key || "all"}
                type="button"
                data-borough-chip={item.key || "__all__"}
                className={[
                  "mobile-borough-pill",
                  item.key ? boroughClassName(item.key) : "mobile-borough-all",
                  active ? "is-active" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => selectBorough(item.key)}
              >
                <strong>{item.label}</strong>
                <span>{item.count}</span>
              </button>
            );
          })}
        </div>

        <div className="mobile-status-tabs" aria-label="Status filters">
          {mobileStatusStats.map((item) => (
            <button
              key={item.status}
              type="button"
              className={statusView === item.status ? "is-active" : ""}
              onClick={() => selectStatus(item.status)}
            >
              <strong>{item.status === "All" ? "Status" : item.status}</strong>
              <span>{item.count}</span>
            </button>
          ))}
        </div>

        <div className="mobile-search" role="search">
          <span aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setSelectedId("");
              setQuery(event.target.value);
            }}
            placeholder="Search jobs, address, OMO, tenant..."
            aria-label="Search field map"
          />
          <button type="button" className="mobile-search-filter" aria-label="Open search filters" onClick={() => setActivePanel("filters")} />
        </div>

        <div className="mobile-map-shell">
          <JobsMap
            jobs={filtered}
            selectedId={selected?.id || ""}
            onSelect={setSelectedId}
            focusCenter={mapFocusCenter}
            focusZoom={mapFocusZoom}
            focusKey={mapFocusKey}
            variant="clusters"
            userLocation={userLocation}
          />
          <div className="map-place-label label-bronx">The Bronx</div>
          <div className="map-place-label label-manhattan">Manhattan</div>
          <div className="map-place-label label-queens">Queens</div>
          <div className="map-place-label label-brooklyn">Brooklyn</div>
          <div className="map-place-label label-staten">Staten Island</div>
          {selectedMapsHref ? (
            <a href={selectedMapsHref} target="_blank" rel="noreferrer" className="floating-map-button nav-arrow-icon" aria-label="Navigate" />
          ) : (
            <button type="button" className="floating-map-button nav-arrow-icon" aria-label="Fit visible jobs" onClick={fitVisibleMap} />
          )}
          <button type="button" className="floating-map-button layers-icon" aria-label="Open expanded map" onClick={() => setActivePanel("map")} />
          <button type="button" className="floating-map-button locate-icon" aria-label="Locate me" onClick={locateUser} />
          <button type="button" className="visible-count-button" aria-label="Open visible jobs" onClick={() => setActivePanel("jobs")}>
            <strong>{filtered.length}</strong>
            <span>Visible Jobs</span>
          </button>
        </div>

        {selected ? (
          <article
            className="mobile-job-sheet is-job-command"
            onTouchStart={(event) => {
              jobSheetTouchStartY.current = event.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(event) => {
              if (jobSheetTouchStartY.current === null) return;
              const endY = event.changedTouches[0]?.clientY ?? jobSheetTouchStartY.current;
              if (endY - jobSheetTouchStartY.current > 58) {
                setSelectedId("");
              }
              jobSheetTouchStartY.current = null;
            }}
          >
            <div className="sheet-handle" />
            <div className="field-card-grid">
              <div className="field-card-main">
                <div className="sheet-topline">
                  <StatusBadge status={displayStatus(selected)} />
                  <span className="sheet-omo">OMO {selected.id}</span>
                  <button
                    type="button"
                    aria-label={isSelectedSaved ? "Unsave job" : "Save job"}
                    className={isSelectedSaved ? "star-icon is-saved" : "star-icon"}
                    onClick={() => {
                      setSavedIds((current) => (
                        selected && current.includes(selected.id)
                          ? current.filter((id) => id !== selected.id)
                          : selected ? [...current, selected.id] : current
                      ));
                      notify(isSelectedSaved ? "Job removed from saved list." : "Job saved.");
                    }}
                  />
                  <button type="button" className="sheet-map-return" aria-label="Close job card and return to map" onClick={() => setSelectedId("")}>
                    <span aria-hidden="true">×</span>
                    Map
                  </button>
                </div>
                <h2>{selected.id}</h2>
                {selectedAddress ? <p>{selectedAddress}</p> : null}
                <div className="field-card-tags">
                  {selectedBorough ? <strong>{selectedBorough.toUpperCase()}</strong> : null}
                  {selectedTrade ? <span>{selectedTrade}</span> : null}
                </div>
              </div>

              <div className="field-card-details">
                {selectedDetailItems.map((item) => (
                  <div key={item.label}>
                    <span className={`field-detail-icon ${item.icon}`} aria-hidden="true" />
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              {selectedPhotoUrl ? (
                <div className="field-photo-card">
                  <img src={selectedPhotoUrl} alt={`Uploaded field photo for ${selected.id}`} />
                  <span className="photo-count">{Math.min(selectedPhotoUrls.length, 4)}/4</span>
                </div>
              ) : null}
            </div>

            <div className="job-card-status-actions" aria-label="Update job status">
              {FIELD_STATUS_ACTIONS.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  className={selectedStatus.toLowerCase() === action.value.toLowerCase() ? "is-active" : ""}
                  onClick={() => updateSelectedStatus(action.value)}
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="sheet-actions">
              {selectedMapsHref ? (
                <a href={selectedMapsHref} target="_blank" rel="noreferrer"><span className="action-nav" />Navigate</a>
              ) : (
                <button type="button" disabled><span className="action-nav" />Navigate</button>
              )}
              {selectedPhoneHref ? (
                <a href={selectedPhoneHref}><span className="action-phone" />Call Tenant</a>
              ) : (
                <a href={selectedDetailHref}><span className="action-phone" />Contact Info</a>
              )}
              <label className={uploadingPhotos ? "is-disabled" : ""}>
                <span className="action-camera" />{uploadingPhotos ? "Saving" : "Photos"}
                <input
                  className="sr-only-file"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingPhotos}
                  onChange={handlePhotoChange}
                />
              </label>
              <a href={selectedDetailHref}><span className="action-doc" />Documents</a>
            </div>

            <div className="sheet-pager">
              <button type="button" aria-label="Previous job" onClick={() => selectRelativeJob(-1)}>‹</button>
              <span>{filtered.length && selectedIndex >= 0 ? selectedIndex + 1 : 1} / {Math.max(filtered.length, 1)}</span>
              <button type="button" aria-label="Next job" onClick={() => selectRelativeJob(1)}>›</button>
            </div>
          </article>
        ) : filtered.length === 0 ? (
          <article className="mobile-job-sheet is-empty">
            <div className="sheet-handle" />
            <div className="sheet-topline">
              {statusView === "All" ? <span className="scope-badge">Map</span> : <StatusBadge status={statusView} />}
              <span>{emptyMapScope}</span>
            </div>
            <h2>{emptyMapTitle}</h2>
            <p className="sheet-address">{emptyMapMessage}</p>
            <div className="sheet-actions">
              <button type="button" onClick={resetFilters}><span className="action-nav" />All Boroughs</button>
              <button type="button" onClick={() => setActivePanel("filters")}><span className="action-doc" />Filters</button>
            </div>
          </article>
        ) : null}
        <nav className="mobile-tabbar" aria-label="Field command navigation">
          <button
            type="button"
            className="is-active"
            onClick={fitVisibleMap}
          >
            <span className="tab-map-icon" aria-hidden="true" />
            <strong>Map</strong>
          </button>
          <button type="button" onClick={() => setActivePanel("jobs")}>
            <span className="tab-list-icon" aria-hidden="true" />
            <strong>Jobs</strong>
          </button>
          <button type="button" className="tab-add-button" aria-label="Open quick actions" onClick={() => setActivePanel("add")}>
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => setActivePanel("notifications")}>
            <span className="tab-alert-icon" aria-hidden="true">
              {alertCount ? <i>{alertCount}</i> : null}
            </span>
            <strong>Alerts</strong>
          </button>
          <button type="button" onClick={() => setActivePanel("account")}>
            <span className="tab-more-icon" aria-hidden="true" />
            <strong>More</strong>
          </button>
        </nav>
      </section>
      {activePanel ? (
        <section className="drawer-layer" role="dialog" aria-modal="true" aria-label={panelTitle}>
          <button type="button" className="drawer-backdrop" aria-label="Close panel" onClick={() => setActivePanel("")} />
          <aside className={activePanel === "map" ? "command-drawer is-map" : "command-drawer"}>
            <header className="drawer-head">
              <div>
                <span>HPD Bid Dashboard</span>
                <h2>{panelTitle}</h2>
              </div>
              <button type="button" aria-label="Close panel" onClick={() => setActivePanel("")}>×</button>
            </header>

            {activePanel === "filters" ? (
              <div className="drawer-stack">
                <label className="drawer-field">
                  <span>Search jobs</span>
                  <input
                    value={query}
                    onChange={(event) => {
                      setSelectedId("");
                      setQuery(event.target.value);
                    }}
                    aria-label="Search jobs"
                  />
                </label>
                <div>
                  <h3>Borough</h3>
                  <div className="drawer-chip-grid">
                    <button
                      type="button"
                      className={!borough ? "is-active" : ""}
                      onClick={() => {
                        setSelectedId("");
                        setQuery("");
                        setUserLocation(null);
                        setBorough("");
                      }}
                    >
                      All Boroughs
                    </button>
                    {boroughs.map((name) => (
                      <button key={name} type="button" className={borough === name ? "is-active" : ""} onClick={() => selectBorough(name)}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Status</h3>
                  <div className="drawer-chip-grid">
                    {(["All", "Open", "Awarded", "Pending"] as StatusView[]).map((status) => (
                      <button key={status} type="button" className={statusView === status ? "is-active" : ""} onClick={() => selectStatus(status)}>
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="drawer-actions">
                  <button type="button" onClick={resetFilters}>Reset filters</button>
                  <button type="button" onClick={() => setActivePanel("")}>Apply filters</button>
                </div>
              </div>
            ) : null}

            {activePanel === "notifications" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Filtered</span><strong>{filtered.length}</strong></div>
                  <div><span>Queue</span><strong>{queuedRows.length}</strong></div>
                </div>
                <div className="drawer-list">
                  {activityRows.map((job, index) => (
                    <button
                      key={`${job.id}-notification`}
                      type="button"
                      onClick={() => {
                        setSelectedId(job.id);
                        setActivePanel("");
                      }}
                    >
                      <strong>{job.id}</strong>
                      <span>{job.address || "No address listed"}</span>
                      <small>{activityStamp(job)} · {displayStatus(job)}</small>
                    </button>
                  ))}
                </div>
                <div className="drawer-actions">
                  <button type="button" onClick={() => showTable("live")}>Open live table</button>
                  <button type="button" onClick={() => showTable("queue")}>Open command queue</button>
                </div>
              </div>
            ) : null}

            {activePanel === "jobs" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Visible</span><strong>{filtered.length}</strong></div>
                  <div><span>Mapped</span><strong>{mappableJobs.length}</strong></div>
                </div>
                <div className="drawer-list">
                  {filtered.slice(0, 20).map((job) => (
                    <button
                      key={`${job.id}-mobile-list`}
                      type="button"
                      onClick={() => {
                        setSelectedId(job.id);
                        setActivePanel("");
                      }}
                    >
                      <strong>{job.id}</strong>
                      <span>{job.address || "No address listed"}</span>
                      <small>{job.borough || "NY"} · {formatCurrency(job.amountValue, job.bidAmount)} · {formatJobStartDate(job)}</small>
                    </button>
                  ))}
                </div>
                <div className="drawer-actions">
                  <button type="button" onClick={exportFilteredJobs}>Export visible</button>
                  <button type="button" onClick={resetFilters}>Reset filters</button>
                </div>
              </div>
            ) : null}

            {activePanel === "add" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Selected</span><strong>{selected ? "1" : "0"}</strong></div>
                  <div><span>Saved</span><strong>{savedJobs.length}</strong></div>
                </div>
                <div className="drawer-actions is-grid">
                  <button
                    type="button"
                    onClick={() => {
                      if (!filtered[0]) {
                        notify("No visible jobs to open.");
                        return;
                      }
                      setSelectedId(filtered[0].id);
                      setActivePanel("");
                    }}
                  >
                    Open first visible job
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selected) {
                        notify("Open a job before saving it.");
                        return;
                      }
                      setSavedIds((current) => current.includes(selected.id) ? current : [...current, selected.id]);
                      notify(`${selected.id} saved.`);
                    }}
                  >
                    Save selected job
                  </button>
                  {selected ? (
                    <a href={selectedDetailHref}>Open selected profile</a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!filtered[0]) {
                          notify("No visible job profile to open.");
                          return;
                        }
                        window.location.href = jobDetailHref(filtered[0]);
                      }}
                    >
                      Open first profile
                    </button>
                  )}
                  <a href={exportDataHref} download={exportFileName} onClick={() => notify(`${filtered.length} records exported.`)}>Download visible CSV</a>
                </div>
              </div>
            ) : null}

            {activePanel === "account" ? (
              <div className="drawer-stack">
                <div className="drawer-account">
                  <span className="account-logo">HPD</span>
                  <div>
                    <strong>Project Workspace</strong>
                    <span>Live dashboard data</span>
                    <small>{savedJobs.length} saved jobs · {filtered.length} filtered records</small>
                  </div>
                </div>
                <div className="drawer-actions is-grid">
                  <a href="/jobs">Open jobs board</a>
                  {selected ? (
                    <a href={selectedDetailHref}>Open selected job</a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!filtered[0]) {
                          notify("No visible job to open.");
                          return;
                        }
                        window.location.href = jobDetailHref(filtered[0]);
                      }}
                    >
                      Open first visible job
                    </button>
                  )}
                  <a href={exportDataHref} download={exportFileName} onClick={() => notify(`${filtered.length} records exported.`)}>Download CSV</a>
                  <a href="/api/jobs" target="_blank" rel="noreferrer">Open API data</a>
                </div>
              </div>
            ) : null}

            {activePanel === "map" ? (
              <div className="drawer-stack">
                <div className="drawer-map-frame">
                  <JobsMap
                    jobs={filtered}
                    selectedId={selected?.id || ""}
                    onSelect={setSelectedId}
                    focusCenter={mapFocusCenter}
                    focusZoom={mapFocusZoom}
                    focusKey={mapFocusKey}
                    userLocation={userLocation}
                  />
                </div>
                {selected ? (
                  <div className="drawer-selected-job">
                    <StatusBadge status={displayStatus(selected)} />
                    <strong>{selected.id}</strong>
                    <span>{selected.address || "No address listed"}</span>
                    <div className="drawer-actions">
                      <a href={selectedMapsHref} target="_blank" rel="noreferrer">Open in Maps</a>
                      <a href={selectedDetailHref}>Open job details</a>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activePanel === "system" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Loaded jobs</span><strong>{jobs.length}</strong></div>
                  <div><span>Mapped jobs</span><strong>{mappableJobs.length}</strong></div>
                  <div><span>ITB files</span><strong>{itbCount}</strong></div>
                  <div><span>COA awards</span><strong>{coaCount}</strong></div>
                </div>
                <div className="system-checks">
                  <span>Map renderer online</span>
                  <span>CSV data loaded</span>
                  <span>Job image upload API ready</span>
                  <span>Status update API ready</span>
                </div>
                <div className="drawer-actions is-grid">
                  <button type="button" onClick={() => window.location.reload()}>Reload live data</button>
                  <a href="/api/jobs" target="_blank" rel="noreferrer">Open jobs API</a>
                  <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(systemReport)}`} download="hpd-system-status.txt">Download status</a>
                </div>
              </div>
            ) : null}

            {activePanel === "contact" && selected ? (
              <div className="drawer-stack">
                <div className="drawer-selected-job">
                  <StatusBadge status={displayStatus(selected)} />
                  <strong>{selectedTenantName || selected.id}</strong>
                  {selected.tenantPhone ? <span>{selected.tenantPhone}</span> : null}
                  {selectedAddress ? <span>{selectedAddress}</span> : null}
                </div>
                <div className="drawer-actions is-grid">
                  {selectedPhoneHref ? <a href={selectedPhoneHref}>Call now</a> : <a href={selectedDetailHref}>Open contact record</a>}
                  <a href={selectedMapsHref} target="_blank" rel="noreferrer">Navigate to job</a>
                  <a href={selectedDetailHref}>Open job details</a>
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      ) : null}
      {toast ? <div className="command-toast" role="status">{toast}</div> : null}
    </main>
  );
}
