"use client";

import { useEffect } from "react";
import { keepAppData } from "../lib/phone-storage";

// Registers the offline helper (public/sw.js) so the app opens from the home screen even with a
// weak signal. Production only, so local development always runs fresh code.
// An iPhone home-screen app is usually resumed, not restarted, so the helper is also checked for
// a newer version every time the app comes back to the screen; a new helper reloads the app.
export default function ServiceWorkerRegister() {
  // Ask the phone to keep the saved jobs, photos and videos even when it runs low on space.
  useEffect(() => { void keepAppData(); }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => { registration = reg; }).catch(() => {});
    const check = () => { if (document.visibilityState === "visible") registration?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
    };
  }, []);
  return null;
}
