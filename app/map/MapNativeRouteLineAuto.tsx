"use client";

import { useEffect, useRef } from "react";

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function visibleRouteRows() {
  return Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"))
    .filter((row) => row.getClientRects().length > 0);
}

function routeSignature() {
  return visibleRouteRows()
    .map((row) => {
      const main = row.querySelector<HTMLElement>(".map-day-route-stop-main") || row;
      return [textOf(main.querySelector("b")), textOf(main.querySelector("span")), textOf(main.querySelector("small"))]
        .filter(Boolean)
        .join("|");
    })
    .join("||");
}

function drawLineButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => /^draw line$/i.test(textOf(button)) || /draw.*route.*line/i.test(textOf(button))) || null;
}

export default function MapNativeRouteLineAuto() {
  const lastSignatureRef = useRef("");
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let destroyed = false;
    let scheduled = false;

    const requestDraw = () => {
      if (destroyed) return;
      const signature = routeSignature();
      if (!signature || signature === lastSignatureRef.current) return;
      lastSignatureRef.current = signature;

      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        const button = drawLineButton();
        if (button && !button.disabled) button.click();
      }, 180);
    };

    const schedule = () => {
      if (scheduled || destroyed) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        requestDraw();
      });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-index", "aria-current"],
    });

    const clickListener = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest(".map-day-route-stop-row, .map-day-route-edit-actions, .map-day-route-tray")) {
        window.setTimeout(schedule, 80);
        window.setTimeout(schedule, 280);
      }
    };
    document.addEventListener("click", clickListener, true);

    const interval = window.setInterval(schedule, 700);

    return () => {
      destroyed = true;
      observer.disconnect();
      document.removeEventListener("click", clickListener, true);
      window.clearInterval(interval);
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
    };
  }, []);

  return null;
}
