"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type PanelTab = "assistant" | "route" | "overview";

type BoroughKey = "manhattan" | "bronx" | "brooklyn" | "queens" | "staten-island" | "all";

type JobRecord = Record<string, unknown>;

type RouteStopCard = {
  index: number;
  number: string;
  job: string;
  detail: string;
  active: boolean;
};

type MapStats = {
  visibleJobs: number;
  routeStops: number;
  selectedJob: boolean;
  nextStop: string;
  routeSummary: string;
  activeStopIndex: number;
  routeStopCards: RouteStopCard[];
};

type ResultCard = {
  id: string;
  address: string;
  borough: string;
  status: string;
};

const BOROUGH_OPTIONS: Array<{ key: BoroughKey; label: string; short: string; aliases: string[] }> = [
  { key: "manhattan", label: "Manhattan", short: "MN", aliases: ["manhattan", "mn", "new york"] },
  { key: "bronx", label: "Bronx", short: "BX", aliases: ["bronx", "bx"] },
  { key: "brooklyn", label: "Brooklyn", short: "BK", aliases: ["brooklyn", "bk", "kings"] },
  { key: "queens", label: "Queens", short: "QN", aliases: ["queens", "qn"] },
  { key: "staten-island", label: "Staten Island", short: "SI", aliases: ["staten island", "staten", "si", "richmond"] },
  { key: "all", label: "All NYC", short: "ALL", aliases: ["all", "any borough", "anywhere", "nyc"] },
];

const ALL_JOBS = bundledJobsData as JobRecord[];
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root: ParentNode, pattern: RegExp) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => pattern.test(textOf(button)));
}

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

function jobId(job: JobRecord) {
  return firstValue(job, ["OMO", "omo", "jobId", "id"]);
}

function jobAddress(job: JobRecord) {
  return firstValue(job, ["BuildingAddress", "Building_Address", "Address", "address", "location"]);
}

function jobBorough(job: JobRecord) {
  return firstValue(job, ["Borough", "borough", "Boro", "boro"]);
}

function jobStatus(job: JobRecord) {
  return firstValue(job, ["WorkflowStatus", "StatusOverride", "FieldOutcome", "status", "Status", "CurrentStatus", "Outcome"]);
}

function normalizeBorough(value: string): BoroughKey | null {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  for (const option of BOROUGH_OPTIONS) {
    if (option.aliases.some((alias) => normalized === alias || normalized.includes(alias))) return option.key;
  }
  return null;
}

function boroughLabel(key: BoroughKey | null) {
  return BOROUGH_OPTIONS.find((option) => option.key === key)?.label || "this area";
}

function jobMatchesBorough(job: JobRecord, borough: BoroughKey) {
  if (borough === "all") return true;
  return normalizeBorough(jobBorough(job)) === borough;
}

function statusOverrideMap() {
  const overrides = new Map<string, JobRecord>();
  if (typeof window === "undefined") return overrides;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) || "";
    if (!/(job|status|override|workflow)/i.test(key)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as JobRecord;
          const id = jobId(record);
          if (id) overrides.set(id.toUpperCase(), record);
        });
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed as Record<string, unknown>).forEach(([id, value]) => {
          if (value && typeof value === "object") overrides.set(id.toUpperCase(), value as JobRecord);
        });
      }
    } catch {
      // Ignore unrelated local-storage records.
    }
  }

  return overrides;
}

function mergedJob(job: JobRecord, overrides: Map<string, JobRecord>) {
  const override = overrides.get(jobId(job).toUpperCase());
  return override ? { ...job, ...override } : job;
}

function isNoAccessJob(job: JobRecord) {
  const firstAttempt = firstValue(job, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt"]);
  const secondAttempt = firstValue(job, ["NoAccessSecondAttemptAt", "noAccessSecondAttemptAt"]);
  if (firstAttempt || secondAttempt) return true;

  const status = [jobStatus(job), firstValue(job, ["WorkflowStatus", "FieldOutcome", "StatusOverride"])]
    .join(" ")
    .toLowerCase();
  return /\bno\s*access\b|\baccess\s*refus|\brefus(?:ed|al)\b/.test(status);
}

function isClosedJob(job: JobRecord) {
  return /\b(final|completed|complete|archived|closed|cancelled)\b/i.test(jobStatus(job));
}

function readMapStats(): MapStats {
  const routeRows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
  const routeStopCards = routeRows.map((row, index) => {
    const main = row.querySelector<HTMLElement>(".map-day-route-stop-main") || row;
    return {
      index,
      number: textOf(main.querySelector("b")) || String(index + 1),
      job: textOf(main.querySelector("span")) || `Stop ${index + 1}`,
      detail: textOf(main.querySelector("small")) || "Address unavailable",
      active: row.classList.contains("active"),
    };
  });
  const activeIndex = routeStopCards.findIndex((stop) => stop.active);
  const safeActiveIndex = routeStopCards.length ? Math.max(0, activeIndex) : -1;
  const activeStop = safeActiveIndex >= 0 ? routeStopCards[safeActiveIndex] : null;
  const routeSummary = textOf(document.querySelector(".map-day-route-selected-summary")) || textOf(document.querySelector(".map-day-route-tray-head"));

  return {
    visibleJobs: document.querySelectorAll(".maturity-map-marker").length,
    routeStops: routeStopCards.length,
    selectedJob: Boolean(document.querySelector(".job-drawer.selected-focus")),
    nextStop: activeStop ? `${activeStop.job} · ${activeStop.detail}` : "No stop selected",
    routeSummary: routeSummary || "No active route",
    activeStopIndex: safeActiveIndex,
    routeStopCards,
  };
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function MapAiGuidedDashboard() {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<PanelTab>("assistant");
  const [voiceOn, setVoiceOn] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedBorough, setSelectedBorough] = useState<BoroughKey | null>(null);
  const [showBoroughPrompt, setShowBoroughPrompt] = useState(true);
  const [resultCards, setResultCards] = useState<ResultCard[]>([]);
  const [stats, setStats] = useState<MapStats>({
    visibleJobs: 0,
    routeStops: 0,
    selectedJob: false,
    nextStop: "No stop selected",
    routeSummary: "No active route",
    activeStopIndex: -1,
    routeStopCards: [],
  });
  const [clearButtonStyle, setClearButtonStyle] = useState<CSSProperties>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: "Good morning. Where should we go today? Choose a borough below." },
    { id: "welcome-help", role: "assistant", text: "After you choose, ask me: “Any No Access in this area?” or tell me to build today’s route." },
  ]);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const priorRouteCountRef = useRef(0);

  const refreshStats = () => {
    const next = readMapStats();
    setStats(next);
    return next;
  };

  const ensurePortalTarget = (host: HTMLElement) => {
    const target = (document.fullscreenElement as HTMLElement | null) || document.querySelector<HTMLElement>(".map-shell") || document.body;
    if (host.parentElement !== target) target.appendChild(host);
  };

  useEffect(() => {
    const host = document.createElement("div");
    host.className = "map-ai-portal-host";
    host.setAttribute("data-ai-map-dashboard", "true");
    ensurePortalTarget(host);
    setPortalHost(host);

    const movePortal = () => ensurePortalTarget(host);
    document.addEventListener("fullscreenchange", movePortal);
    const timer = window.setInterval(movePortal, 700);

    return () => {
      document.removeEventListener("fullscreenchange", movePortal);
      window.clearInterval(timer);
      host.remove();
    };
  }, []);

  const alignClearButton = () => {
    const agentButton = document.querySelector<HTMLElement>(".map-agent-top-button");
    if (!agentButton) {
      setClearButtonStyle({ top: "max(12px, calc(env(safe-area-inset-top) + 10px))", right: 12 });
      return;
    }
    const rect = agentButton.getBoundingClientRect();
    const roomOnRight = window.innerWidth - rect.right;
    setClearButtonStyle({
      top: Math.max(8, rect.top),
      left: roomOnRight >= 118 ? rect.right + 8 : Math.max(8, rect.left - 110),
      height: Math.max(40, rect.height),
    });
  };

  useEffect(() => {
    const sync = () => {
      const next = refreshStats();
      if (priorRouteCountRef.current === 0 && next.routeStops > 0) {
        setCollapsed(false);
        setTab("route");
      }
      priorRouteCountRef.current = next.routeStops;
      alignClearButton();
      if (portalHost) ensurePortalTarget(portalHost);
    };

    sync();
    const interval = window.setInterval(sync, 800);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", alignClearButton);
    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      window.removeEventListener("resize", alignClearButton);
    };
  }, [portalHost]);

  useEffect(() => {
    if (!collapsed && tab === "assistant") messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, collapsed, tab]);

  const speak = (text: string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const addAssistant = (text: string) => {
    setMessages((current) => [...current, { id: `${Date.now()}-${Math.random()}-assistant`, role: "assistant", text }]);
    speak(text);
  };

  const addUser = (text: string) => {
    setMessages((current) => [...current, { id: `${Date.now()}-${Math.random()}-user`, role: "user", text }]);
  };

  const activateMapBorough = (borough: BoroughKey) => {
    if (borough === "all") return;
    const option = BOROUGH_OPTIONS.find((item) => item.key === borough);
    if (!option) return;
    const root = document.querySelector(".map-shell") || document;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((item) => {
      const text = textOf(item).toLowerCase();
      return text === option.label.toLowerCase() || text === option.short.toLowerCase();
    });
    button?.click();
  };

  const chooseBorough = (borough: BoroughKey, announce = true) => {
    setSelectedBorough(borough);
    setShowBoroughPrompt(false);
    setResultCards([]);
    setCollapsed(false);
    setTab("assistant");
    activateMapBorough(borough);

    const label = boroughLabel(borough);
    const count = ALL_JOBS.filter((job) => jobMatchesBorough(job, borough) && !isClosedJob(job)).length;
    if (announce) addUser(label);
    addAssistant(`${label} selected. I found ${count} active job${count === 1 ? "" : "s"}. What should I check?`);
  };

  const answerNoAccess = (boroughOverride?: BoroughKey | null) => {
    const borough = boroughOverride || selectedBorough;
    if (!borough) {
      setShowBoroughPrompt(true);
      setCollapsed(false);
      setTab("assistant");
      addAssistant("Choose a borough first so I know what “this area” means.");
      return;
    }

    const overrides = statusOverrideMap();
    const matches = ALL_JOBS
      .map((job) => mergedJob(job, overrides))
      .filter((job) => jobMatchesBorough(job, borough))
      .filter((job) => !isClosedJob(job))
      .filter(isNoAccessJob)
      .map((job) => ({
        id: jobId(job),
        address: jobAddress(job),
        borough: jobBorough(job) || boroughLabel(borough),
        status: jobStatus(job) || "No Access",
      }))
      .filter((job) => job.id)
      .slice(0, 12);

    setCollapsed(false);
    setTab("assistant");
    setResultCards(matches);
    const area = boroughLabel(borough);
    addAssistant(
      matches.length
        ? `YES — I found ${matches.length} active No Access job${matches.length === 1 ? "" : "s"} in ${area}. Tap a job below to show it on the map.`
        : `NO — I do not find any active jobs currently marked No Access in ${area}.`,
    );
  };

  const showJobOnMap = (job: ResultCard) => {
    const inputElement = document.querySelector<HTMLInputElement>(".map-face-search input");
    if (!inputElement) {
      addAssistant(`I found ${job.id}, but the map search control is not available right now.`);
      return;
    }
    setNativeInputValue(inputElement, job.id);
    inputElement.focus();
    window.setTimeout(() => inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })), 80);
    addAssistant(`Showing ${job.id} in map search.`);
  };

  const configureAgentBorough = (borough: BoroughKey | null) => {
    if (!borough) return;
    const panel = document.querySelector<HTMLElement>(".map-day-agent-launcher.agent-panel-open");
    const select = panel?.querySelector<HTMLSelectElement>("select");
    if (select) {
      const label = boroughLabel(borough).toLowerCase();
      const option = Array.from(select.options).find((item) => {
        const text = `${item.text} ${item.value}`.toLowerCase();
        return borough === "all" ? /all/.test(text) : text.includes(label) || normalizeBorough(text) === borough;
      });
      if (option) setNativeSelectValue(select, option.value);
    }

    const commandInput = panel?.querySelector<HTMLInputElement>("input");
    if (commandInput) {
      setNativeInputValue(
        commandInput,
        borough === "all"
          ? "Build the best route from all active mapped jobs."
          : `Start in ${boroughLabel(borough)} first, then route me through the best active jobs.`,
      );
    }
  };

  const openAgent = async () => {
    setCollapsed(false);
    const mapRoot = document.querySelector(".map-shell") || document;
    const button = document.querySelector<HTMLButtonElement>(".map-agent-top-button") || Array.from(mapRoot.querySelectorAll<HTMLButtonElement>("button")).find((item) => /agent/i.test(textOf(item)));
    if (!button) {
      addAssistant("I could not find the Agent control on this map view.");
      return false;
    }
    button.click();
    await wait(160);
    configureAgentBorough(selectedBorough);
    addAssistant("Agent opened. The AI control center will remain visible.");
    return true;
  };

  const startRoute = async () => {
    setBusy(true);
    setCollapsed(false);
    setTab("route");
    try {
      const opened = await openAgent();
      if (!opened) return;
      configureAgentBorough(selectedBorough);
      const mapRoot = document.querySelector(".map-shell") || document;
      const panel = document.querySelector(".map-day-agent-launcher.agent-panel-open") || mapRoot;
      const startButton = findButton(panel, /^start$/i) || findButton(panel, /start route/i) || findButton(panel, /^route$/i);
      if (!startButton) {
        addAssistant("Agent is open. Tap Start in the Agent bar to build the route.");
        return;
      }
      startButton.click();
      addAssistant(`Building today’s route${selectedBorough ? ` for ${boroughLabel(selectedBorough)}` : ""}. I will stay open while the map changes.`);
      await wait(1100);
      setCollapsed(false);
      setTab("route");
      refreshStats();
      if (portalHost) ensurePortalTarget(portalHost);
    } finally {
      setBusy(false);
    }
  };

  const clearRoute = async () => {
    setBusy(true);
    setCollapsed(false);
    setTab("route");
    try {
      const hiddenTray = document.querySelector<HTMLElement>(".map-day-route-tray.is-hidden");
      if (hiddenTray) {
        findButton(hiddenTray, /show|expand|open/i)?.click();
        await wait(100);
      }
      let removed = 0;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const removeButton = document.querySelector<HTMLButtonElement>(".map-day-route-edit-actions button.remove");
        if (!removeButton) break;
        removeButton.click();
        removed += 1;
        await wait(90);
      }
      refreshStats();
      addAssistant(removed > 0 ? `Route cleared. Removed ${removed} stop${removed === 1 ? "" : "s"}.` : "There is no active route to clear.");
    } finally {
      setBusy(false);
    }
  };

  const showRoute = async () => {
    setCollapsed(false);
    setTab("route");
    const tray = document.querySelector<HTMLElement>(".map-day-route-tray");
    if (!tray) {
      addAssistant("There is no active route yet.");
      return;
    }
    if (tray.classList.contains("is-hidden")) {
      findButton(tray, /show|expand|open/i)?.click();
      await wait(80);
    }
    addAssistant("The active route is expanded on the map.");
  };

  const focusRouteStop = (index: number) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
    const row = rows[index];
    const button = row?.querySelector<HTMLButtonElement>(".map-day-route-stop-main") || row?.querySelector<HTMLButtonElement>("button");
    if (!button) {
      addAssistant("That route stop is not available on the map yet.");
      return;
    }
    setCollapsed(false);
    setTab("route");
    button.click();
    window.setTimeout(refreshStats, 120);
  };

  const summarize = () => {
    setCollapsed(false);
    setTab("overview");
    const current = refreshStats();
    const jobs = `${current.visibleJobs} visible job${current.visibleJobs === 1 ? "" : "s"}`;
    const route = current.routeStops ? `${current.routeStops} active route stop${current.routeStops === 1 ? "" : "s"}` : "no active route";
    addAssistant(`Map summary: ${jobs}, ${route}${current.selectedJob ? ", and one selected job is open" : ""}.`);
  };

  const runCommand = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setCollapsed(false);
    setTab("assistant");
    addUser(text);
    setInput("");
    const normalized = text.toLowerCase();
    const boroughInText = normalizeBorough(normalized);

    if (/good morning|where should|which boro|which borough|choose borough/.test(normalized)) {
      setShowBoroughPrompt(true);
      setResultCards([]);
      addAssistant("Good morning. Where should we go today? Choose a borough below.");
      return;
    }
    if (boroughInText && !/no\s*access/.test(normalized)) {
      chooseBorough(boroughInText, false);
      return;
    }
    if (/no\s*access|access refused|refused access/.test(normalized)) {
      if (boroughInText) setSelectedBorough(boroughInText);
      answerNoAccess(boroughInText || selectedBorough);
      return;
    }
    if (/clear|remove|cancel/.test(normalized) && /route|stops?/.test(normalized)) return clearRoute();
    if (/start|build|make|optimi[sz]e/.test(normalized) && /route|day|today/.test(normalized)) return startRoute();
    if (/show|open|expand/.test(normalized) && /route/.test(normalized)) return showRoute();
    if (/next/.test(normalized) && /stop|job|route/.test(normalized)) return focusRouteStop(stats.activeStopIndex >= 0 ? stats.activeStopIndex : 0);
    if (/agent|assistant/.test(normalized) && /open|show|start/.test(normalized)) return openAgent();
    if (/how many|summary|status|visible|today/.test(normalized)) return summarize();
    addAssistant("You can choose a borough, ask “Any No Access in this area?”, build today’s route, clear the route, or ask for a map summary.");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCommand(input);
  };

  const routeLabel = useMemo(() => (stats.routeStops ? `${stats.routeStops} stop${stats.routeStops === 1 ? "" : "s"}` : "No route"), [stats.routeStops]);
  const routeProgress = stats.routeStops ? Math.min(100, Math.max(8, ((Math.max(stats.activeStopIndex, 0) + 1) / stats.routeStops) * 100)) : 0;
  const insightText = stats.routeStops
    ? `Route is active with ${stats.routeStops} stop${stats.routeStops === 1 ? "" : "s"}. Keep the next stop selected and use Clear Route only when you want to rebuild the day.`
    : `No route is active${selectedBorough ? ` for ${boroughLabel(selectedBorough)}` : ""}. Choose a borough, check No Access, or build the route.`;

  const dashboard = (
    <>
      <button type="button" className="map-ai-clear-route" style={clearButtonStyle} onClick={() => void clearRoute()} disabled={busy || stats.routeStops === 0} aria-label="Clear active map route">Clear route</button>

      {collapsed ? (
        <button type="button" className="map-ai-rail" onClick={() => setCollapsed(false)} aria-label="Open AI map dashboard">
          <span className="map-ai-live-dot" aria-hidden="true" /><strong>AI</strong><small>{stats.routeStops || stats.visibleJobs}</small><span className="map-ai-rail-label">Open dashboard</span>
        </button>
      ) : (
        <aside className="map-ai-control-center" aria-label="AI map dashboard">
          <header className="map-ai-control-head">
            <div className="map-ai-brand-block">
              <span className="map-ai-live-dot" aria-hidden="true" />
              <div><strong>AI Map Control Center</strong><small>{selectedBorough ? `${boroughLabel(selectedBorough)} · ready` : "Online · choose borough"}</small></div>
            </div>
            <div className="map-ai-head-actions">
              <span className={`map-ai-route-badge ${stats.routeStops ? "is-live" : ""}`}>{stats.routeStops ? `${stats.routeStops} stops` : "No route"}</span>
              <button type="button" onClick={() => setVoiceOn((value) => !value)} aria-pressed={voiceOn}>{voiceOn ? "Voice on" : "Voice"}</button>
              <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse AI map dashboard">Collapse</button>
            </div>
          </header>

          <section className="map-ai-kpis" aria-label="Live map status">
            <article><span>Jobs</span><b>{stats.visibleJobs}</b><small>visible</small></article>
            <article><span>Route</span><b>{stats.routeStops}</b><small>stops</small></article>
            <article><span>Area</span><b>{selectedBorough ? BOROUGH_OPTIONS.find((item) => item.key === selectedBorough)?.short : "—"}</b><small>selected</small></article>
          </section>

          <nav className="map-ai-tabs" aria-label="AI dashboard sections">
            <button type="button" className={tab === "assistant" ? "active" : ""} onClick={() => setTab("assistant")}>Assistant</button>
            <button type="button" className={tab === "route" ? "active" : ""} onClick={() => setTab("route")}>Route</button>
            <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
          </nav>

          <div className="map-ai-panel-body">
            {tab === "assistant" ? (
              <section className="map-ai-assistant-panel">
                <div className="map-ai-messages" aria-live="polite">
                  {messages.slice(-14).map((message) => <p key={message.id} className={`map-ai-message ${message.role}`}>{message.text}</p>)}

                  {showBoroughPrompt ? (
                    <div className="map-ai-borough-prompt">
                      <strong>Where should we go today?</strong>
                      <div className="map-ai-borough-grid">
                        {BOROUGH_OPTIONS.map((option) => (
                          <button type="button" key={option.key} className={selectedBorough === option.key ? "active" : ""} onClick={() => chooseBorough(option.key)}>
                            <b>{option.short}</b><span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="map-ai-context-actions">
                      <button type="button" onClick={() => answerNoAccess()}>Any No Access?</button>
                      <button type="button" onClick={() => void startRoute()}>Build route</button>
                      <button type="button" onClick={() => setShowBoroughPrompt(true)}>Change borough</button>
                    </div>
                  )}

                  {resultCards.length ? (
                    <div className="map-ai-result-list" aria-label="No Access jobs">
                      {resultCards.map((job) => (
                        <button type="button" key={job.id} onClick={() => showJobOnMap(job)}>
                          <span><b>{job.id}</b><small>{job.status}</small></span><strong>{job.address || job.borough}</strong>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div ref={messageEndRef} />
                </div>
              </section>
            ) : null}

            {tab === "route" ? (
              <section className="map-ai-route-panel">
                <div className="map-ai-route-status">
                  <div className="map-ai-route-status-line"><span className={stats.routeStops ? "is-live" : ""}>{stats.routeStops ? "Route active" : "Route not started"}</span><b>{routeLabel}</b></div>
                  <div className="map-ai-progress-track" aria-label={`Route progress ${Math.round(routeProgress)} percent`}><span style={{ width: `${routeProgress}%` }} /></div>
                  <small>{stats.routeSummary}</small>
                </div>
                <div className="map-ai-next-stop"><span>Next stop</span><strong>{stats.nextStop}</strong><button type="button" onClick={() => focusRouteStop(stats.activeStopIndex >= 0 ? stats.activeStopIndex : 0)} disabled={!stats.routeStops}>Focus on map</button></div>
                {stats.routeStopCards.length ? (
                  <ol className="map-ai-stop-list" aria-label="Route stops">
                    {stats.routeStopCards.map((stop) => (
                      <li key={`${stop.job}-${stop.index}`}><button type="button" className={stop.active ? "active" : ""} onClick={() => focusRouteStop(stop.index)}><b>{stop.number}</b><span><strong>{stop.job}</strong><small>{stop.detail}</small></span></button></li>
                    ))}
                  </ol>
                ) : null}
                <div className="map-ai-route-actions">
                  <button type="button" className="primary" onClick={() => void startRoute()} disabled={busy}>Start / rebuild</button>
                  <button type="button" onClick={() => void showRoute()} disabled={!stats.routeStops}>Show route</button>
                  <button type="button" className="danger" onClick={() => void clearRoute()} disabled={busy || !stats.routeStops}>Clear route</button>
                </div>
              </section>
            ) : null}

            {tab === "overview" ? (
              <section className="map-ai-overview-panel">
                <article><span>AI recommendation</span><p>{insightText}</p></article>
                <article><span>Current map state</span><p>{stats.visibleJobs} visible jobs · {routeLabel} · {stats.selectedJob ? "job card open" : "no job selected"}</p></article>
                <div className="map-ai-overview-actions"><button type="button" onClick={summarize}>Refresh summary</button><button type="button" onClick={() => void openAgent()}>Open Agent tools</button></div>
              </section>
            ) : null}
          </div>

          <div className="map-ai-command-actions">
            <button type="button" className="primary" onClick={() => void startRoute()} disabled={busy}>Start</button>
            <button type="button" className="danger" onClick={() => void clearRoute()} disabled={busy || !stats.routeStops}>Clear</button>
            <button type="button" onClick={() => answerNoAccess()}>No Access?</button>
            <button type="button" onClick={() => void openAgent()}>Agent</button>
          </div>

          <form className="map-ai-form" onSubmit={submit}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask AI: any No Access in this area?" aria-label="Ask the map assistant" />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </aside>
      )}
    </>
  );

  return portalHost ? createPortal(dashboard, portalHost) : null;
}
