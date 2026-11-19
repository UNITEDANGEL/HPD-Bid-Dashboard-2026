"use client";

import { useEffect, useState } from "react";
import { installErrorReporting, plainError, type AppError } from "../lib/app-errors";

// Script errors and failed promises on every page go to Claude (lib/app-errors), without names or numbers. The person
// sees what happened in plain words for 7 seconds (owner, 18 Nov "do all": errors were only logged for Claude), at most
// once a minute so a burst of the same problem doesn't pile up.
export default function ErrorReporter() {
  const [said, setSaid] = useState("");
  useEffect(() => {
    installErrorReporting(process.env.NEXT_PUBLIC_APP_NUMBER || process.env.NEXT_PUBLIC_APP_COMMIT || "");
    let last = 0;
    let hide = 0;
    const show = (e: Event) => {
      const d = (e as CustomEvent<{ kind: AppError["kind"]; msg: string }>).detail;
      if (!d || Date.now() - last < 60000) return;
      last = Date.now();
      setSaid(plainError(d.kind, d.msg));
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setSaid(""), 7000);
    };
    window.addEventListener("hpd-app-error", show);
    return () => { window.removeEventListener("hpd-app-error", show); window.clearTimeout(hide); };
  }, []);
  if (!said) return null;
  return (
    <div role="status" data-hpd-smoke="app-error-note" onClick={() => setSaid("")}
      style={{ position: "fixed", zIndex: 4000, left: 12, right: 12, top: "calc(env(safe-area-inset-top, 0px) + 12px)", maxWidth: 520, margin: "0 auto", padding: "10px 14px", borderRadius: 14, background: "#fff7ed", border: "1.5px solid #fb923c", color: "#7c2d12", font: "700 14px/1.35 system-ui, sans-serif", boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
      ⚠️ {said} <span style={{ fontWeight: 600, opacity: 0.8 }}>Sent to Claude to fix.</span>
    </div>
  );
}
