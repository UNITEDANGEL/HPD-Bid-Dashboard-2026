"use client";

import { useEffect } from "react";

export default function MapRouteClickFix() {
  useEffect(() => {
    let destroyed = false;

    const apply = () => {
      if (destroyed) return;
      const svg = document.querySelector<SVGSVGElement>("svg.hpd-marker-guide");
      if (!svg) return;

      svg.style.pointerEvents = "auto";
      svg.querySelectorAll<SVGElement>("path, g[aria-hidden='true']").forEach((element) => {
        element.style.pointerEvents = "none";
      });
      svg.querySelectorAll<SVGGElement>("g[data-route-index]").forEach((element) => {
        element.style.pointerEvents = "all";
        element.style.cursor = "pointer";
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = window.setInterval(apply, 200);

    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
