"use client";

import { useEffect } from "react";

type RouteIntent = "nearby" | "borough" | "urgent" | "appointments" | "manual";
type RouteRequest = {
  intent: RouteIntent;
  borough?: string | null;
  stopCount?: number;
  prompt?: string;
};

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function visibleButtons(root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => !button.disabled && button.getClientRects().length > 0,
  );
}

function clickButton(patterns: RegExp[], root: ParentNode = document) {
  const button = visibleButtons(root).find((candidate) =>
    patterns.some((pattern) => pattern.test(textOf(candidate))),
  );
  button?.click();
  return Boolean(button);
}

function waitFor(
  test: () => boolean,
  onReady: () => void,
  onTimeout: () => void,
  timeoutMs = 12000,
) {
  const started = Date.now();
  const timer = window.setInterval(() => {
    if (test()) {
      window.clearInterval(timer);
      onReady();
      return;
    }
    if (Date.now() - started >= timeoutMs) {
      window.clearInterval(timer);
      onTimeout();
    }
  }, 180);
}

function notify(type: "working" | "done" | "error", message: string) {
  window.dispatchEvent(new CustomEvent("hpd:ai-route-status", { detail: { type, message } }));
}

export default function MapAIRouteBridge() {
  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<RouteRequest>).detail;
      if (!detail?.intent) return;

      notify("working", "AI is selecting and ordering the best jobs…");

      const panel = () => document.querySelector<HTMLElement>("[data-hpd-unified-workflow]");
      const hasRecommended = () => Boolean(document.querySelector(".hpd-unified-recommended"));
      const hasRoute = () => Boolean(document.querySelector(".hpd-unified-route"));

      // Return the native workflow to its planning screen when possible.
      clickButton([/^End Day$/i, /^New Plan$/i, /^Back to Jobs$/i]);

      window.setTimeout(() => {
        if (detail.intent === "nearby") {
          clickButton([/^Near Me/i], panel() || document);
        } else if (detail.intent === "borough") {
          clickButton([/^Choose Borough/i], panel() || document);
          window.setTimeout(() => {
            const borough = String(detail.borough || "").trim();
            if (!borough || !clickButton([new RegExp(`^${borough}$`, "i")], panel() || document)) {
              notify("error", "Choose a borough, then try Find best route again.");
            }
          }, 220);
        } else {
          clickButton([/^Highest Priority/i, /^Near Me/i], panel() || document);
        }

        waitFor(
          hasRecommended,
          () => {
            if (detail.intent === "urgent") clickButton([/^Urgent$/i], panel() || document);
            if (detail.intent === "appointments") clickButton([/^Appointments$/i], panel() || document);

            window.setTimeout(() => {
              if (!clickButton([/^Build Full Route$/i], panel() || document)) {
                notify("error", "AI selected jobs, but the route builder did not open.");
                return;
              }

              waitFor(
                hasRoute,
                () => notify("done", "Route ready. Review the numbered stops and press Enroute Stop 1."),
                () => notify("error", "The route did not finish building. Try again."),
              );
            }, detail.intent === "urgent" || detail.intent === "appointments" ? 500 : 120);
          },
          () => notify("error", "No matching jobs were returned. Try Near Me or another borough."),
        );
      }, 180);
    };

    window.addEventListener("hpd:ai-route-request", handleRequest as EventListener);
    return () => window.removeEventListener("hpd:ai-route-request", handleRequest as EventListener);
  }, []);

  return null;
}
