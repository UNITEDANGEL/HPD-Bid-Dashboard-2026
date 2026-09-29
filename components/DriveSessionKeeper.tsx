"use client";

import { useEffect } from "react";

// Renew while the app is in use; never open consent or upload records silently.
export default function DriveSessionKeeper() {
  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    let lastAttempt = 0;
    async function check() {
      if (document.visibilityState !== "visible" || !navigator.onLine || checking || Date.now() - lastAttempt < 600000) return;
      checking = true;
      lastAttempt = Date.now();
      try {
        const response = await fetch("/api/drive/session", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const status = await response.json();
        if (!status.connected || Date.now() - Date.parse(status.verifiedAt || "") < 21600000) return;
        await fetch("/api/drive/check", { method: "POST", signal: controller.signal });
      } catch { /* Offline and service errors must not interrupt fieldwork. */ }
      finally { checking = false; }
    }
    void check();
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 3600000);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
