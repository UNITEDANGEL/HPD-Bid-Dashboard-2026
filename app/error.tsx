"use client";

import { useEffect } from "react";
import { recordError } from "../lib/app-errors";

// A screen that crashes (2 Nov): instead of a blank page, say so in plain words with one tap to go on, and send the
// error to Claude (lib/app-errors) so it gets fixed without you having to explain it.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    recordError("crash", `${error.name || "Error"}: ${error.message || ""}`, error.stack?.split("\n").slice(0, 3).join(" ") || error.digest || "", process.env.NEXT_PUBLIC_APP_NUMBER || process.env.NEXT_PUBLIC_APP_COMMIT || "");
  }, [error]);
  return (
    <main data-hpd-smoke="app-error" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#0b1220", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <p style={{ fontSize: 44, margin: 0 }} aria-hidden="true">🛠️</p>
        <h1 style={{ fontSize: 22, margin: "10px 0 8px" }}>This screen hit a problem</h1>
        <p style={{ fontSize: 16, lineHeight: 1.45, margin: "0 0 20px", color: "#cbd5e1" }}>Nothing you saved is lost. Claude got a note about it and will fix it.</p>
        <button type="button" data-hpd-smoke="app-error-retry" onClick={() => reset()} style={{ width: "100%", minHeight: 52, border: 0, borderRadius: 14, background: "#6366f1", color: "#fff", font: "700 17px system-ui, sans-serif" }}>↻ Try again</button>
        <button type="button" data-hpd-smoke="app-error-map" onClick={() => { location.href = "/map/?view=all&map=1"; }} style={{ width: "100%", minHeight: 48, marginTop: 10, border: "1.5px solid #475569", borderRadius: 14, background: "transparent", color: "#e2e8f0", font: "600 16px system-ui, sans-serif" }}>🗺 Back to the map</button>
      </div>
    </main>
  );
}
