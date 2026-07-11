"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type MapStats = {
  visibleJobs: number;
  routeStops: number;
  selectedJob: boolean;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root: ParentNode, pattern: RegExp) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => pattern.test(textOf(button)));
}

export default function MapAiDashboard() {
  const [open, setOpen] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<MapStats>({ visibleJobs: 0, routeStops: 0, selectedJob: false });
  const [clearButtonStyle, setClearButtonStyle] = useState<React.CSSProperties>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Good morning. Your map dashboard is ready. I can open Agent, start today’s route, clear the route, or summarize the jobs currently visible on the map.",
    },
  ]);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const refreshStats = () => {
    setStats({
      visibleJobs: document.querySelectorAll(".maturity-map-marker").length,
      routeStops: document.querySelectorAll(".map-day-route-stop-row").length,
      selectedJob: Boolean(document.querySelector(".job-drawer.selected-focus")),
    });
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
    refreshStats();
    alignClearButton();
    const interval = window.setInterval(() => {
      refreshStats();
      alignClearButton();
    }, 900);
    window.addEventListener("resize", alignClearButton);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", alignClearButton);
    };
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, open]);

  const speak = (text: string) => {
    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
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
    const button =
      document.querySelector<HTMLButtonElement>(".map-agent-top-button") ||
      Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => /agent/i.test(textOf(item)));
    if (!button) {
      addAssistant("I could not find the Agent control on the current map view.");
      return false;
    }
    button.click();
    await wait(140);
    addAssistant("Agent is open on the map.");
    return true;
  };

  const startRoute = async () => {
    setBusy(true);
    try {
      const opened = await openAgent();
      if (!opened) return;
      const panel = document.querySelector(".map-day-agent-launcher.agent-panel-open") || document;
      const startButton =
        findButton(panel, /^start$/i) ||
        findButton(panel, /start route/i) ||
        findButton(panel, /^route$/i);
      if (!startButton) {
        addAssistant("Agent is open. Tap Start in the Agent bar to build the route.");
        return;
      }
      startButton.click();
      addAssistant("Starting the map route now. The Agent panel will close when the route is ready.");
    } finally {
      setBusy(false);
      await wait(250);
      refreshStats();
    }
  };

  const clearRoute = async () => {
    setBusy(true);
    try {
      const hiddenTray = document.querySelector<HTMLElement>(".map-day-route-tray.is-hidden");
      if (hiddenTray) {
        const showButton = findButton(hiddenTray, /show|expand|open/i);
        showButton?.click();
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
      if (removed > 0) {
        addAssistant(`Route cleared. Removed ${removed} stop${removed === 1 ? "" : "s"} from the map.`);
      } else {
        addAssistant("There is no active route to clear.");
      }
    } finally {
      setBusy(false);
    }
  };

  const showRoute = async () => {
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

  const summarize = () => {
    refreshStats();
    const jobText = `${stats.visibleJobs} visible job${stats.visibleJobs === 1 ? "" : "s"}`;
    const routeText = stats.routeStops
      ? `${stats.routeStops} active route stop${stats.routeStops === 1 ? "" : "s"}`
      : "no active route";
    addAssistant(`Map summary: ${jobText}, ${routeText}${stats.selectedJob ? ", and one selected job card is open" : ""}.`);
  };

  const runCommand = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    addUser(text);
    setInput("");
    const normalized = text.toLowerCase();

    if (/clear|remove|cancel/.test(normalized) && /route|stops?/.test(normalized)) {
      await clearRoute();
      return;
    }
    if (/start|build|make|optimi[sz]e/.test(normalized) && /route|day|today/.test(normalized)) {
      await startRoute();
      return;
    }
    if (/show|open|expand/.test(normalized) && /route/.test(normalized)) {
      await showRoute();
      return;
    }
    if (/agent|assistant/.test(normalized) && /open|show|start/.test(normalized)) {
      await openAgent();
      return;
    }
    if (/how many|summary|status|visible|today/.test(normalized)) {
      summarize();
      return;
    }

    addAssistant("I can help directly on this map. Try: “start today’s route,” “clear route,” “show route,” “open Agent,” or “map summary.”");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCommand(input);
  };

  const routeLabel = useMemo(() => {
    if (!stats.routeStops) return "No route";
    return `${stats.routeStops} stop${stats.routeStops === 1 ? "" : "s"}`;
  }, [stats.routeStops]);

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

      {open ? (
        <aside className="map-ai-dashboard" aria-label="AI map dashboard">
          <header className="map-ai-dashboard-head">
            <div>
              <span className="map-ai-live-dot" aria-hidden="true" />
              <strong>AI Map Dashboard</strong>
              <small>Live on the map</small>
            </div>
            <div className="map-ai-head-actions">
              <button type="button" onClick={() => setVoiceOn((value) => !value)} aria-pressed={voiceOn}>
                {voiceOn ? "Voice on" : "Voice off"}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Minimize AI dashboard">
                —
              </button>
            </div>
          </header>

          <section className="map-ai-stats" aria-label="Map status">
            <div><b>{stats.visibleJobs}</b><span>Visible jobs</span></div>
            <div><b>{routeLabel}</b><span>Route</span></div>
            <div><b>{stats.selectedJob ? "Open" : "None"}</b><span>Selected job</span></div>
          </section>

          <div className="map-ai-messages" aria-live="polite">
            {messages.slice(-8).map((message) => (
              <p key={message.id} className={`map-ai-message ${message.role}`}>
                {message.text}
              </p>
            ))}
            <div ref={messageEndRef} />
          </div>

          <div className="map-ai-quick-actions">
            <button type="button" onClick={() => void startRoute()} disabled={busy}>Start route</button>
            <button type="button" onClick={() => void clearRoute()} disabled={busy || stats.routeStops === 0}>Clear route</button>
            <button type="button" onClick={summarize}>Map summary</button>
            <button type="button" onClick={() => void openAgent()}>Open Agent</button>
          </div>

          <form className="map-ai-form" onSubmit={submit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask the map assistant…"
              aria-label="Ask the map assistant"
            />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </aside>
      ) : (
        <button type="button" className="map-ai-reopen" onClick={() => setOpen(true)}>
          AI Map
        </button>
      )}
    </>
  );
}
