"use client";

import { useEffect, useState } from "react";

// 📶 Owner idea (13 Nov): in a basement or with weak signal the app says so in plain words instead of looking frozen.
// Photos, steps and forms are already saved on the phone first and sent when the signal is back.
export default function SignalBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" data-hpd-smoke="signal-banner" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100000, padding: "8px 12px", background: "#b45309", color: "#fff", fontWeight: 800, fontSize: 16, textAlign: "center" }}>
      📶 Waiting for signal. Everything you do is saved on this phone and sends itself when the signal is back.
    </div>
  );
}
