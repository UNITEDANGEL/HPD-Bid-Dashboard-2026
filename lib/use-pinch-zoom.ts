"use client";
// Pinch / double-tap zoom for a page view (owner, 20 Oct: "I just want to zoom in the job pages, not the whole app"). The
// app is locked at 1x; a box using this zooms its own pictures from 1x to 5x around the fingers and pans with one finger.
// Put {...bind} on the scrolling box (it gets data-zoomable) and width `${zoom * 100}%` on the pictures inside.
import { useRef, useState, type TouchEvent } from "react";

export function usePinchZoom(max = 5) {
  const [zoom, setZoom] = useState(1);
  const ref = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const pinch = useRef<{ d: number; z: number; mx: number; my: number } | null>(null);
  const pan = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const lastTap = useRef(0);
  const zoomTo = (z: number, cx?: number, cy?: number) => {
    const el = ref.current;
    const next = Math.min(max, Math.max(1, z));
    if (!el) { zoomRef.current = next; setZoom(next); return; }
    const r = el.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    const k = next / zoomRef.current;
    const sx = (el.scrollLeft + px) * k - px, sy = (el.scrollTop + py) * k - py;
    zoomRef.current = next;
    setZoom(next);
    requestAnimationFrame(() => { el.scrollLeft = sx; el.scrollTop = sy; });
  };
  const dist = (t: TouchEvent["touches"]) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const bind = {
    ref,
    "data-zoomable": "",
    "data-zoom": zoom.toFixed(2),
    onTouchStart: (e: TouchEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.touches.length === 2) {
        pan.current = null;
        pinch.current = { d: dist(e.touches), z: zoomRef.current, mx: (e.touches[0].clientX + e.touches[1].clientX) / 2, my: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      } else if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 300) { zoomTo(zoomRef.current > 1.2 ? 1 : 2.5, e.touches[0].clientX, e.touches[0].clientY); lastTap.current = 0; return; }
        lastTap.current = now;
        pan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, sx: el.scrollLeft, sy: el.scrollTop };
      }
    },
    onTouchMove: (e: TouchEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.touches.length === 2 && pinch.current) {
        const p = pinch.current;
        zoomTo(p.z * (dist(e.touches) / p.d), p.mx, p.my);
      } else if (e.touches.length === 1 && pan.current) {
        el.scrollLeft = pan.current.sx - (e.touches[0].clientX - pan.current.x);
        el.scrollTop = pan.current.sy - (e.touches[0].clientY - pan.current.y);
      }
    },
    onTouchEnd: (e: TouchEvent) => { if (e.touches.length < 2) pinch.current = null; if (!e.touches.length) pan.current = null; },
  };
  return { zoom, zoomTo, bind };
}
