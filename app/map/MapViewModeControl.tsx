"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ViewMode = "map" | "focus";

const VIEW_MODE_KEY = "hpd-map-view-mode-v1";

function readMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === "focus" ? "focus" : "map";
  } catch {
    return "map";
  }
}

function saveMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Keep the selected mode for this page session.
  }
}

function applyMode(mode: ViewMode) {
  document.body.classList.toggle("hpd-map-always-visible", mode === "map");
  document.body.classList.toggle("hpd-workflow-focus", mode === "focus");
  document.body.dataset.hpdViewMode = mode;
}

export default function MapViewModeControl() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<ViewMode>("map");

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "hpd-map-view-mode-portal";
    element.dataset.hpdUnifiedWorkflow = "true";
    document.body.appendChild(element);
    setHost(element);

    const saved = readMode();
    setMode(saved);
    applyMode(saved);

    const moveHost = () => {
      const target = (document.fullscreenElement as HTMLElement | null) || document.body;
      if (element.parentElement !== target) target.appendChild(element);
    };

    document.addEventListener("fullscreenchange", moveHost);
    moveHost();

    return () => {
      document.removeEventListener("fullscreenchange", moveHost);
      element.remove();
      document.body.classList.remove("hpd-map-always-visible", "hpd-workflow-focus");
      delete document.body.dataset.hpdViewMode;
    };
  }, []);

  const chooseMode = (next: ViewMode) => {
    setMode(next);
    saveMode(next);
    applyMode(next);
    window.dispatchEvent(new CustomEvent("hpd-map-view-mode", { detail: { mode: next } }));
  };

  if (!host) return null;

  return createPortal(
    <section className="hpd-map-view-mode" aria-label="Map and workflow layout">
      <span>View</span>
      <button
        type="button"
        className={mode === "map" ? "active" : ""}
        aria-pressed={mode === "map"}
        onClick={() => chooseMode("map")}
      >
        <b>Map Always</b>
        <small>Map + work</small>
      </button>
      <button
        type="button"
        className={mode === "focus" ? "active" : ""}
        aria-pressed={mode === "focus"}
        onClick={() => chooseMode("focus")}
      >
        <b>Focus Work</b>
        <small>More detail</small>
      </button>
    </section>,
    host,
  );
}
