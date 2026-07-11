"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type WorkspaceMode = "lite" | "desktop";
type TabName = "chat" | "results" | "route" | "job";

type ResultPair = {
  main: HTMLButtonElement;
  enroute: HTMLButtonElement | null;
  id: string;
};

const MODE_KEY = "hpd-map-workspace-mode-v1";

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readStoredMode(): WorkspaceMode | null {
  try {
    const value = window.localStorage.getItem(MODE_KEY);
    return value === "lite" || value === "desktop" ? value : null;
  } catch {
    return null;
  }
}

function saveMode(mode: WorkspaceMode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The current page still keeps the mode.
  }
}

function visibleButtons(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => !button.disabled && button.getClientRects().length > 0,
  );
}

function clickButton(root: ParentNode, patterns: RegExp[]) {
  const button = visibleButtons(root).find((candidate) =>
    patterns.some((pattern) => pattern.test(textOf(candidate))),
  );
  button?.click();
  return Boolean(button);
}

function resultPairs(list: HTMLElement): ResultPair[] {
  const mainButtons = Array.from(
    list.querySelectorAll<HTMLButtonElement>(
      ":scope > .hpd-ai-list-main, :scope > button:not(.hpd-ai-enroute)",
    ),
  ).filter((button) => !button.classList.contains("hpd-ai-enroute"));

  return mainButtons.map((main) => {
    main.classList.add("hpd-ai-list-main");
    const id = textOf(main.querySelector("span strong")).toUpperCase();
    const next = main.nextElementSibling;
    let enroute =
      next instanceof HTMLButtonElement && next.classList.contains("hpd-ai-enroute")
        ? next
        : null;

    if (!enroute && id) {
      enroute = Array.from(list.querySelectorAll<HTMLButtonElement>(".hpd-ai-enroute")).find(
        (button) => button.dataset.enrouteFor === id,
      ) || null;
    }

    return { main, enroute, id };
  });
}

function openDispatcherTab(tab: TabName) {
  document.querySelector<HTMLButtonElement>(".hpd-ai-rail")?.click();
  window.setTimeout(() => {
    const patterns: Record<TabName, RegExp> = {
      chat: /^chat\b/i,
      results: /^results\b/i,
      route: /^route\b/i,
      job: /^job\b/i,
    };
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"))
      .find((candidate) => patterns[tab].test(textOf(candidate)));
    button?.click();
  }, 90);
}

function clickFieldAction(patterns: RegExp[]) {
  const root = document.querySelector<HTMLElement>(".job-drawer.selected-focus") || document;
  return clickButton(root, patterns);
}

export default function MapResponsiveWorkspace() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>("desktop");
  const [expanded, setExpanded] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  const pageRef = useRef(0);
  const signatureRef = useRef("");
  const modeRef = useRef<WorkspaceMode>("desktop");
  const expandedRef = useRef(false);

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "hpd-responsive-workspace-portal";
    document.body.appendChild(element);
    setHost(element);

    const saved = readStoredMode();
    const defaultMode: WorkspaceMode = saved || (window.matchMedia("(max-width: 820px)").matches ? "lite" : "desktop");
    modeRef.current = defaultMode;
    setMode(defaultMode);
    setExpanded(defaultMode === "desktop");
    expandedRef.current = defaultMode === "desktop";

    return () => element.remove();
  }, []);

  const applyBodyMode = (nextMode: WorkspaceMode, nextExpanded: boolean) => {
    document.body.classList.toggle("hpd-workspace-lite", nextMode === "lite");
    document.body.classList.toggle("hpd-workspace-desktop", nextMode === "desktop");
    document.body.classList.toggle("hpd-workspace-expanded", nextExpanded);
    document.body.classList.toggle("hpd-workspace-compact", !nextExpanded);
  };

  const applyResults = () => {
    const list = document.querySelector<HTMLElement>(".hpd-ai-result-list");
    const panel = document.querySelector<HTMLElement>(".hpd-ai-results-panel");
    if (!list || !panel) return;

    panel.classList.add("hpd-responsive-results-panel");
    list.classList.add("hpd-responsive-results-list");
    list.dataset.workspaceMode = modeRef.current;

    const pairs = resultPairs(list);
    const signature = pairs.map((pair) => pair.id).join("|");
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      pageRef.current = 0;
    }

    const perPage = modeRef.current === "lite" ? 1 : window.innerWidth >= 1180 ? 2 : 1;
    const totalPages = Math.max(1, Math.ceil(pairs.length / perPage));
    pageRef.current = Math.min(Math.max(pageRef.current, 0), totalPages - 1);
    const first = pageRef.current * perPage;
    const last = first + perPage;

    pairs.forEach((pair, index) => {
      const visible = index >= first && index < last;
      pair.main.hidden = !visible;
      if (pair.enroute) pair.enroute.hidden = !visible;
      if (!visible) return;

      const slot = index - first;
      const column = modeRef.current === "lite" || perPage === 1 ? 1 : slot + 1;
      pair.main.style.gridColumn = String(column);
      pair.main.style.gridRow = "1";
      pair.main.dataset.workspaceSlot = String(slot + 1);
      if (pair.enroute) {
        pair.enroute.style.gridColumn = String(column);
        pair.enroute.style.gridRow = "1";
        pair.enroute.dataset.workspaceSlot = String(slot + 1);
      }
    });

    let toolbar = panel.querySelector<HTMLElement>(".hpd-responsive-results-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("section");
      toolbar.className = "hpd-responsive-results-toolbar";
      toolbar.innerHTML = `
        <div><span>Jobs</span><strong data-responsive-count>0</strong></div>
        <button type="button" data-responsive-page="previous" aria-label="Previous job">‹</button>
        <b data-responsive-page-label>1 / 1</b>
        <button type="button" data-responsive-page="next" aria-label="Next job">›</button>
      `;
      list.insertAdjacentElement("beforebegin", toolbar);
    }

    const count = toolbar.querySelector<HTMLElement>("[data-responsive-count]");
    const label = toolbar.querySelector<HTMLElement>("[data-responsive-page-label]");
    const previous = toolbar.querySelector<HTMLButtonElement>('[data-responsive-page="previous"]');
    const next = toolbar.querySelector<HTMLButtonElement>('[data-responsive-page="next"]');
    if (count) count.textContent = `${pairs.length} job${pairs.length === 1 ? "" : "s"}`;
    if (label) label.textContent = `${pageRef.current + 1} / ${totalPages}`;
    if (previous) {
      previous.disabled = pageRef.current <= 0;
      previous.onclick = () => {
        pageRef.current = Math.max(0, pageRef.current - 1);
        applyResults();
      };
    }
    if (next) {
      next.disabled = pageRef.current >= totalPages - 1;
      next.onclick = () => {
        pageRef.current = Math.min(totalPages - 1, pageRef.current + 1);
        applyResults();
      };
    }

    setResultCount(pairs.length);
  };

  useEffect(() => {
    if (!host) return;
    let scheduled = false;

    const sync = () => {
      applyBodyMode(modeRef.current, expandedRef.current);
      const open = Boolean(document.querySelector(".job-drawer.selected-focus"));
      setJobOpen(open);
      applyResults();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const timer = window.setInterval(schedule, 700);
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      document.body.classList.remove("hpd-workspace-lite", "hpd-workspace-desktop", "hpd-workspace-expanded", "hpd-workspace-compact");
    };
  }, [host]);

  const chooseMode = (next: WorkspaceMode) => {
    modeRef.current = next;
    setMode(next);
    saveMode(next);
    const nextExpanded = next === "desktop" ? true : false;
    expandedRef.current = nextExpanded;
    setExpanded(nextExpanded);
    pageRef.current = 0;
    applyBodyMode(next, nextExpanded);
    window.setTimeout(applyResults, 50);
  };

  const toggleExpanded = () => {
    const next = !expandedRef.current;
    expandedRef.current = next;
    setExpanded(next);
    applyBodyMode(modeRef.current, next);
  };

  const mediaAction = (kind: "before" | "after") => {
    const patterns = kind === "before"
      ? [/capture before media/i, /^before media$/i, /before photo/i]
      : [/capture after media/i, /^after media$/i, /after photo/i];
    if (!clickFieldAction(patterns)) {
      document.querySelector<HTMLElement>(".field-media-option-hub, .field-media-step-cue, [data-field-media-console], .field-evidence-gallery")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const outcomeAction = () => {
    if (!clickFieldAction([/media complete/i, /choose outcome/i, /completed work/i])) {
      document.querySelector<HTMLElement>(".hpd-agent-primary-actions")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const packageAction = () => {
    if (!clickFieldAction([/full package/i, /^paperwork$/i, /generate package/i])) {
      window.open("/paperwork", "_blank", "noopener,noreferrer");
    }
  };

  if (!host) return null;

  const controls = (
    <>
      {!jobOpen ? (
        <section className="hpd-workspace-switch" aria-label="Workspace layout">
          <button type="button" className={mode === "lite" ? "active" : ""} onClick={() => chooseMode("lite")}>iPhone Lite</button>
          <button type="button" className={mode === "desktop" ? "active" : ""} onClick={() => chooseMode("desktop")}>Desktop</button>
          {mode === "lite" ? <button type="button" onClick={toggleExpanded}>{expanded ? "Compact" : "Expand"}</button> : null}
        </section>
      ) : null}

      {!jobOpen && mode === "lite" ? (
        <nav className="hpd-lite-command-dock" aria-label="Lite map controls">
          <button type="button" onClick={() => openDispatcherTab("chat")}><span>☀</span><b>Plan</b></button>
          <button type="button" onClick={() => openDispatcherTab("results")}><span>{resultCount || "•"}</span><b>Jobs</b></button>
          <button type="button" onClick={() => openDispatcherTab("route")}><span>↗</span><b>Route</b></button>
          <button type="button" onClick={() => openDispatcherTab("job")}><span>✓</span><b>Job</b></button>
          <button type="button" onClick={toggleExpanded}><span>{expanded ? "⌄" : "⌃"}</span><b>{expanded ? "Compact" : "Expand"}</b></button>
        </nav>
      ) : null}

      {jobOpen ? (
        <nav className="hpd-mobile-field-dock" aria-label="Field job actions">
          <button type="button" onClick={() => document.querySelector<HTMLElement>(".hpd-agent-coach")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>AI</span><b>Coach</b></button>
          <button type="button" onClick={() => mediaAction("before")}><span>◉</span><b>Before</b></button>
          <button type="button" onClick={() => mediaAction("after")}><span>◎</span><b>After</b></button>
          <button type="button" onClick={outcomeAction}><span>✓</span><b>Outcome</b></button>
          <button type="button" onClick={packageAction}><span>▣</span><b>Package</b></button>
        </nav>
      ) : null}
    </>
  );

  return createPortal(controls, host);
}
