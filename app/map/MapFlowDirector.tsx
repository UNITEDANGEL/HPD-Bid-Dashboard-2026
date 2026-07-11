"use client";

import { useEffect, useRef } from "react";

type FlowStage = "plan" | "jobs" | "route" | "travel" | "field";

type ActiveTrip = {
  id?: string;
  status?: "enroute" | "arrived";
};

const ACTIVE_TRIP_STORAGE_KEY = "hpd-ai-active-trip-v1";

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readTrip(): ActiveTrip | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActiveTrip) : null;
  } catch {
    return null;
  }
}

function isVisible(element: Element | null) {
  return element instanceof HTMLElement && element.getClientRects().length > 0;
}

function clickTab(pattern: RegExp) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"))
    .find((candidate) => pattern.test(textOf(candidate)));
  button?.click();
}

function collapseDispatcher() {
  const center = document.querySelector<HTMLElement>(".hpd-ai-center");
  if (!isVisible(center)) return;
  const collapse = Array.from(center.querySelectorAll<HTMLButtonElement>(".hpd-ai-header-actions button"))
    .find((button) => /collapse/i.test(textOf(button)));
  collapse?.click();
}

function cleanDuplicateControls() {
  document.querySelectorAll(".hpd-ai-smart-flow, .hpd-ai-smart-chat-card").forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>("[data-smart-quick]").forEach((node) => node.remove());
}

function labelPrimaryTabs() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"));
  for (const button of buttons) {
    const label = textOf(button);
    if (/^chat\b/i.test(label)) {
      button.dataset.flowTab = "plan";
      button.setAttribute("aria-label", "Plan and ask AI");
    } else if (/^results\b/i.test(label)) {
      button.dataset.flowTab = "jobs";
      button.setAttribute("aria-label", "Recommended jobs");
    } else if (/^route\b/i.test(label)) {
      button.dataset.flowTab = "route";
      button.setAttribute("aria-label", "Active route");
    } else if (/^job\b/i.test(label)) {
      button.dataset.flowTab = "job";
    }
  }
}

function detectStage(): FlowStage {
  const jobOpen = isVisible(document.querySelector(".job-drawer.selected-focus"));
  if (jobOpen) return "field";

  const trip = readTrip();
  if (trip?.status === "enroute") return "travel";
  if (trip?.status === "arrived") return "field";

  const routeCount = document.querySelectorAll(".hpd-ai-route-list > li").length;
  if (routeCount > 0) return "route";

  const resultCount = document.querySelectorAll(".hpd-ai-result-list .hpd-ai-list-main").length;
  if (resultCount > 0) return "jobs";

  return "plan";
}

export default function MapFlowDirector() {
  const priorStage = useRef<FlowStage | null>(null);
  const priorResultCount = useRef(0);
  const priorRouteCount = useRef(0);

  useEffect(() => {
    let scheduled = false;
    let destroyed = false;

    const sync = () => {
      if (destroyed) return;
      cleanDuplicateControls();
      labelPrimaryTabs();

      const stage = detectStage();
      const resultCount = document.querySelectorAll(".hpd-ai-result-list .hpd-ai-list-main").length;
      const routeCount = document.querySelectorAll(".hpd-ai-route-list > li").length;

      document.body.dataset.hpdFlowStage = stage;
      document.body.classList.toggle("hpd-flow-driving", stage === "travel");
      document.body.classList.toggle("hpd-flow-field", stage === "field");

      const stageChanged = priorStage.current !== stage;
      const resultsJustAppeared = priorResultCount.current === 0 && resultCount > 0;
      const routeJustAppeared = priorRouteCount.current === 0 && routeCount > 0;

      if (stage === "travel" || stage === "field") {
        collapseDispatcher();
      } else if (routeJustAppeared || (stageChanged && stage === "route")) {
        clickTab(/^route\b/i);
      } else if (resultsJustAppeared || (stageChanged && stage === "jobs")) {
        clickTab(/^results\b/i);
      } else if (stageChanged && stage === "plan") {
        clickTab(/^chat\b/i);
      }

      priorStage.current = stage;
      priorResultCount.current = resultCount;
      priorRouteCount.current = routeCount;
    };

    const schedule = () => {
      if (scheduled || destroyed) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });
    const timer = window.setInterval(schedule, 700);
    window.addEventListener("hpd-map-enroute", schedule);
    window.addEventListener("hpd-map-arrived", schedule);

    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("hpd-map-enroute", schedule);
      window.removeEventListener("hpd-map-arrived", schedule);
      delete document.body.dataset.hpdFlowStage;
      document.body.classList.remove("hpd-flow-driving", "hpd-flow-field");
    };
  }, []);

  return null;
}
