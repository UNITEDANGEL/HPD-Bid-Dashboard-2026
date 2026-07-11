"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ViewMode = "map" | "focus";

const STORAGE_KEY = "hpd-hybrid-view-mode-v1";

function readMode(): ViewMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "focus" ? "focus" : "map";
  } catch {
    return "map";
  }
}

export default function MapHybridViewMode() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<ViewMode>("map");

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "hpd-hybrid-view-mode-host";
    document.body.appendChild(element);
    setHost(element);

    const saved = readMode();
    setMode(saved);
    document.body.classList.toggle("hpd-hybrid-map-always", saved === "map");
    document.body.classList.toggle("hpd-hybrid-focus-work", saved === "focus");

    return () => {
      element.remove();
      document.body.classList.remove("hpd-hybrid-map-always", "hpd-hybrid-focus-work");
    };
  }, []);

  const choose = (next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the selected mode for this session.
    }
    document.body.classList.toggle("hpd-hybrid-map-always", next === "map");
    document.body.classList.toggle("hpd-hybrid-focus-work", next === "focus");
  };

  if (!host) return null;

  return createPortal(
    <section className="hpd-hybrid-view-switch" aria-label="Map and focus view options">
      <button type="button" className={mode === "map" ? "active" : ""} onClick={() => choose("map")}>Map Always</button>
      <button type="button" className={mode === "focus" ? "active" : ""} onClick={() => choose("focus")}>Focus Work</button>
    </section>,
    host,
  );
}
