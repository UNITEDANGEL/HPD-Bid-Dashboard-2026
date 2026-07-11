"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type PanelTab = "assistant" | "route" | "overview";

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

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root: ParentNode, pattern: RegExp) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => pattern.test(textOf(button)));
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
  const routeSummary =
    textOf(document.querySelector(".map-day-route-selected-summary")) ||
    textOf(document.querySelector(".map-day-route-tray-head"));

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

export default function MapAiDashboard() {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<PanelTab>("assistant");
  const [voiceOn, setVoiceOn] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
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
    {
      id: "welcome",
      role: "assistant",
      text: "Good morning. Your AI map control center is ready and will stay open while the route runs.",
    },
  ]);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const priorRouteCountRef = useRef(0);

  const refreshStats = () => {
    const next = readMapStats();
    setStats(next);
    return next;
  };

  const alignClearButton = () => {
    const agentButton = document.querySelector<HTMLElement>(".map-agent-top-button");
    if (!agentButton) {
      setClearButtonStyle({ top: "max(12px, calc(env(safe-area-inset-top) + 10px))", right: 12 });
      return;
    }
    const rect = agentButton.getBoundingClientRect();
    const roomOnRight = window.innerWidth - rect.right;
    const placeOnRight = roomOnRight >= 118;
    setClearButtonStyle({
      top: Math.max(8, rect.top),
      left: placeOnRight ? rect.right + 8 : Math.max(8, rect.left - 110),
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
    };

    sync();
    const interval = window.setInterval(sync, 800);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("resize", alignClearButton);
    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      window.removeEventListener("resize", alignClearButton);
    };
  }, []);

  useEffect(() => {
    if (!collapsed && tab === "assistant") {
      messageEndRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages, collapsed, tab]);

  const speak = (text: string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const addAssistant = (text: string) => {
    setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: "assistant", text }]);
    speak(text);
  };

  const addUser = (text: string) => {
    setMessages((current) => [...current, { id: `${Date.now()}-user`, role: "user", text }]);
  };

  const openAgent = async () => {
    setCollapsed(false);
    const mapRoot = document.querySelector(".map-shell") || document;
    const button =
      document.querySelector<HTMLButtonElement>(".map-agent-top-button") ||
      Array.from(mapRoot.querySelectorAll<HTMLButtonElement>("button")).find((item) => /agent/i.test(textOf(item)));

    if (!button) {
      addAssistant("I could not find the Agent control on this map view.");
      return false;
    }

    button.click();
    await wait(140);
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
      const mapRoot = document.querySelector(".map-shell") || document;
      const panel = document.querySelector(".map-day-agent-launcher.agent-panel-open") || mapRoot;
      const startButton =
        findButton(panel, /^start$/i) ||
        findButton(panel, /start route/i) ||
        findButton(panel, /^route$/i);

      if (!startButton) {
        addAssistant("Agent is open. Tap Start in the Agent bar to build the route.");
        return;
      }

      startButton.click();
      addAssistant("Starting today’s route. I am keeping the full AI dashboard open on the right.");
      await wait(900);
      setCollapsed(false);
      setTab("route");
      refreshStats();
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
      addAssistant(
        removed > 0
          ? `Route cleared. Removed ${removed} stop${removed === 1 ? "" : "s"}.`
          : "There is no active route to clear.",
      );
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

  const focusNextStop = () => {
    const index = stats.activeStopIndex >= 0 ? stats.activeStopIndex : 0;
    focusRouteStop(index);
  };

  const summarize = () => {
    setCollapsed(false);
    setTab("overview");
    const current = refreshStats();
    const jobs = `${current.visibleJobs} visible job${current.visibleJobs === 1 ? "" : "s"}`;
    const route = current.routeStops
      ? `${current.routeStops} active route stop${current.routeStops === 1 ? "" : "s"}`
      : "no active route";
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

    if (/clear|remove|cancel/.test(normalized) && /route|stops?/.test(normalized)) return clearRoute();
    if (/start|build|make|optimi[sz]e/.test(normalized) && /route|day|today/.test(normalized)) return startRoute();
    if (/show|open|expand/.test(normalized) && /route/.test(normalized)) return showRoute();
    if (/next/.test(normalized) && /stop|job|route/.test(normalized)) return focusNextStop();
    if (/agent|assistant/.test(normalized) && /open|show|start/.test(normalized)) return openAgent();
    if (/how many|summary|status|visible|today/.test(normalized)) return summarize();

    addAssistant("Try: start today’s route, clear route, show route, focus next stop, open Agent, or map summary.");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCommand(input);
  };

  const routeLabel = useMemo(() => {
    if (!stats.routeStops) return "No route";
    return `${stats.routeStops} stop${stats.routeStops === 1 ? "" : "s"}`;
  }, [stats.routeStops]);

  const routeProgress = stats.routeStops
    ? Math.min(100, Math.max(8, ((Math.max(stats.activeStopIndex, 0) + 1) / stats.routeStops) * 100))
    : 0;

  const insightText = stats.routeStops
    ? `Route is active with ${stats.routeStops} stop${stats.routeStops === 1 ? "" : "s"}. Keep the next stop selected and use Clear Route only when you want to rebuild the day.`
    : "No route is active. Start a route and the control center will stay open while the map updates.";

  return (
    <>
      <button
        type="button"
        className="map-ai-clear-route"
        style={clearButtonStyle}
        onClick={() => void clearRoute()}
        disabled={busy || stats.routeStops === 0}
        aria-label="Clear active map route"
      >
        Clear route
      </button>

      {collapsed ? (
        <button type="button" className="map-ai-rail" onClick={() => setCollapsed(false)} aria-label="Open AI map dashboard">
          <span className="map-ai-live-dot" aria-hidden="true" />
          <strong>AI</strong>
          <small>{stats.routeStops || stats.visibleJobs}</small>
          <span className="map-ai-rail-label">Open dashboard</span>
        </button>
      ) : (
        <aside className="map-ai-control-center" aria-label="AI map dashboard">
          <header className="map-ai-control-head">
            <div className="map-ai-brand-block">
              <span className="map-ai-live-dot" aria-hidden="true" />
              <div>
                <strong>AI Map Control Center</strong>
                <small>Online · always visible</small>
              </div>
            </div>
            <div className="map-ai-head-actions">
              <span className={`map-ai-route-badge ${stats.routeStops ? "is-live" : ""}`}>
                {stats.routeStops ? `${stats.routeStops} stops` : "No route"}
              </span>
              <button type="button" onClick={() => setVoiceOn((value) => !value)} aria-pressed={voiceOn}>
                {voiceOn ? "Voice on" : "Voice"}
              </button>
              <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse AI map dashboard">
                Collapse
              </button>
            </div>
          </header>

          <section className="map-ai-kpis" aria-label="Live map status">
            <article><span>Jobs</span><b>{stats.visibleJobs}</b><small>visible</small></article>
            <article><span>Route</span><b>{stats.routeStops}</b><small>stops</small></article>
            <article><span>Job card</span><b>{stats.selectedJob ? "Open" : "—"}</b><small>selected</small></article>
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
                  {messages.slice(-12).map((message) => (
                    <p key={message.id} className={`map-ai-message ${message.role}`}>{message.text}</p>
                  ))}
                  <div ref={messageEndRef} />
                </div>
                <div className="map-ai-suggestion-row">
                  <button type="button" onClick={() => void runCommand("Start today’s route")}>Build today’s route</button>
                  <button type="button" onClick={() => void runCommand("Map summary")}>Summarize map</button>
                </div>
              </section>
            ) : null}

            {tab === "route" ? (
              <section className="map-ai-route-panel">
                <div className="map-ai-route-status">
                  <div className="map-ai-route-status-line">
                    <span className={stats.routeStops ? "is-live" : ""}>{stats.routeStops ? "Route active" : "Route not started"}</span>
                    <b>{routeLabel}</b>
                  </div>
                  <div className="map-ai-progress-track" aria-label={`Route progress ${Math.round(routeProgress)} percent`}>
                    <span style={{ width: `${routeProgress}%` }} />
                  </div>
                  <small>{stats.routeSummary}</small>
                </div>

                <div className="map-ai-next-stop">
                  <span>Next stop</span>
                  <strong>{stats.nextStop}</strong>
                  <button type="button" onClick={focusNextStop} disabled={!stats.routeStops}>Focus on map</button>
                </div>

                {stats.routeStopCards.length ? (
                  <ol className="map-ai-stop-list" aria-label="Route stops">
                    {stats.routeStopCards.map((stop) => (
                      <li key={`${stop.job}-${stop.index}`}>
                        <button
                          type="button"
                          className={stop.active ? "active" : ""}
                          onClick={() => focusRouteStop(stop.index)}
                        >
                          <b>{stop.number}</b>
                          <span><strong>{stop.job}</strong><small>{stop.detail}</small></span>
                        </button>
                      </li>
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
                <article>
                  <span>AI recommendation</span>
                  <p>{insightText}</p>
                </article>
                <article>
                  <span>Current map state</span>
                  <p>{stats.visibleJobs} visible jobs · {routeLabel} · {stats.selectedJob ? "job card open" : "no job selected"}</p>
                </article>
                <div className="map-ai-overview-actions">
                  <button type="button" onClick={summarize}>Refresh summary</button>
                  <button type="button" onClick={() => void openAgent()}>Open Agent tools</button>
                </div>
              </section>
            ) : null}
          </div>

          <div className="map-ai-command-actions">
            <button type="button" className="primary" onClick={() => void startRoute()} disabled={busy}>Start</button>
            <button type="button" className="danger" onClick={() => void clearRoute()} disabled={busy || !stats.routeStops}>Clear</button>
            <button type="button" onClick={summarize}>Summary</button>
            <button type="button" onClick={() => void openAgent()}>Agent</button>
          </div>

          <form className="map-ai-form" onSubmit={submit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask AI about this map…"
              aria-label="Ask the map assistant"
            />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </aside>
      )}
    </>
  );
}
