"use client";
// One "now" for a page drawn when the site is built and its first draw on the phone (when they differ, React stops
// with error #418 and redraws: "601 jobs over 30 days old" counted on build day vs today). Both use the build time
// first; right after, the phone's real time takes over.
import { useEffect, useState } from "react";

export const BUILT_AT = Number(process.env.NEXT_PUBLIC_BUILT_AT || 0) || Date.parse("2026-01-01T12:00:00Z");
let live = 0; // set once the page is up on the phone
export const nowMs = () => live || BUILT_AT;

// Call in a page's main component: it draws again with the real time right after the first draw.
export function useNow() {
  const [n, setN] = useState(nowMs);
  useEffect(() => { live = Date.now(); setN(live); const t = window.setInterval(() => { live = Date.now(); setN(live); }, 60000); return () => window.clearInterval(t); }, []);
  return n;
}
