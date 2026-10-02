"use client";

import { useEffect } from "react";

// Registers the offline helper (public/sw.js) so the app opens from the home screen even with a
// weak signal. Production only, so local development always runs fresh code.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
