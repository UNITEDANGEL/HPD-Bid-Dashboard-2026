"use client";

import { useEffect } from "react";

const SURFACE_SELECTOR = [
  ".hpd-ai-center",
  ".hpd-ai-smart-summary",
  ".hpd-ai-route-smart-summary",
  ".hpd-responsive-results-list > .hpd-ai-list-main:not([hidden])",
  ".hpd-ai-route-list > li",
  ".hpd-ai-route-card",
  ".hpd-ai-next-card",
  ".hpd-agent-coach",
  ".hpd-field-trip-bar",
  ".hpd-workspace-switch",
  ".hpd-lite-command-dock",
  ".hpd-mobile-field-dock",
  ".job-drawer.selected-focus",
].join(",");

function resetSurface(surface: HTMLElement) {
  surface.style.setProperty("--hpd-tilt-x", "0deg");
  surface.style.setProperty("--hpd-tilt-y", "0deg");
  surface.style.setProperty("--hpd-lift", "0px");
  surface.style.setProperty("--hpd-shine-x", "50%");
  surface.style.setProperty("--hpd-shine-y", "20%");
  surface.classList.remove("is-depth-pressed", "is-depth-focused");
}

function strengthFor(surface: HTMLElement) {
  if (surface.matches(".hpd-ai-center, .job-drawer.selected-focus, .hpd-agent-coach")) return 1.2;
  if (surface.matches(".hpd-workspace-switch, .hpd-lite-command-dock, .hpd-mobile-field-dock")) return 1.8;
  return 4.2;
}

export default function Map3DInteractions() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let pendingSurface: HTMLElement | null = null;
    let pendingX = 0;
    let pendingY = 0;
    let destroyed = false;

    const markSurfaces = (root: ParentNode = document) => {
      if (root instanceof HTMLElement && root.matches(SURFACE_SELECTOR)) {
        root.classList.add("hpd-depth-surface");
      }
      root.querySelectorAll<HTMLElement>(SURFACE_SELECTOR).forEach((surface) => {
        surface.classList.add("hpd-depth-surface");
      });
    };

    const updateMotionClass = () => {
      document.body.classList.add("hpd-depth-ui");
      document.body.classList.toggle("hpd-depth-motion", finePointer.matches && !reducedMotion.matches);
      if (!finePointer.matches || reducedMotion.matches) {
        document.querySelectorAll<HTMLElement>(".hpd-depth-surface").forEach(resetSurface);
      }
    };

    const renderTilt = () => {
      frame = 0;
      const surface = pendingSurface;
      if (!surface || destroyed || !finePointer.matches || reducedMotion.matches) return;

      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.min(1, Math.max(0, (pendingX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (pendingY - rect.top) / rect.height));
      const strength = strengthFor(surface);
      const rotateY = (x - 0.5) * strength * 2;
      const rotateX = (0.5 - y) * strength * 1.35;

      surface.style.setProperty("--hpd-tilt-x", `${rotateX.toFixed(2)}deg`);
      surface.style.setProperty("--hpd-tilt-y", `${rotateY.toFixed(2)}deg`);
      surface.style.setProperty("--hpd-shine-x", `${(x * 100).toFixed(1)}%`);
      surface.style.setProperty("--hpd-shine-y", `${(y * 100).toFixed(1)}%`);
      surface.style.setProperty("--hpd-lift", surface.matches(".hpd-ai-center, .job-drawer.selected-focus") ? "-1px" : "-4px");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches || reducedMotion.matches) return;
      const surface = (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface") || null;
      if (!surface) return;
      pendingSurface = surface;
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(renderTilt);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const surface = (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface");
      if (surface) surface.classList.add("is-depth-hovered");
    };

    const onPointerOut = (event: PointerEvent) => {
      const surface = (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface");
      if (!surface) return;
      const next = event.relatedTarget as Node | null;
      if (next && surface.contains(next)) return;
      surface.classList.remove("is-depth-hovered");
      resetSurface(surface);
      if (pendingSurface === surface) pendingSurface = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const surface = (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface");
      surface?.classList.add("is-depth-pressed");
    };

    const onPointerUp = (event: PointerEvent) => {
      const surface = (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface");
      surface?.classList.remove("is-depth-pressed");
    };

    const onFocusIn = (event: FocusEvent) => {
      (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface")?.classList.add("is-depth-focused");
    };

    const onFocusOut = (event: FocusEvent) => {
      const surface = (event.target as Element | null)?.closest<HTMLElement>(".hpd-depth-surface");
      if (!surface) return;
      const next = event.relatedTarget as Node | null;
      if (!next || !surface.contains(next)) surface.classList.remove("is-depth-focused");
    };

    markSurfaces();
    updateMotionClass();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) markSurfaces(node);
        });
      }
      markSurfaces();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    reducedMotion.addEventListener("change", updateMotionClass);
    finePointer.addEventListener("change", updateMotionClass);

    return () => {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      reducedMotion.removeEventListener("change", updateMotionClass);
      finePointer.removeEventListener("change", updateMotionClass);
      document.body.classList.remove("hpd-depth-ui", "hpd-depth-motion");
      document.querySelectorAll<HTMLElement>(".hpd-depth-surface").forEach((surface) => {
        resetSurface(surface);
        surface.classList.remove("hpd-depth-surface", "is-depth-hovered");
      });
    };
  }, []);

  return null;
}
