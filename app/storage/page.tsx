"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../ios-app.css";
import "./storage.css";

type Status = { configured: boolean; connected: boolean; email?: string; verifiedAt?: string; syncEnabled: boolean };
const ERRORS: Record<string, string> = {
  invalid_state: "Sign-in expired. Please try again.", denied: "Google permission was not granted.",
  missing_code: "Google sign-in did not finish.", exchange_failed: "Google sign-in could not be completed.",
  permission_missing: "Drive permission is incomplete. Please reconnect.", identity_failed: "Could not verify your Google account.",
  wrong_account: "Use the approved Google account for this app.",
};

export default function StoragePage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  async function checkConnection() {
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/drive/check", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        if (result.reconnectRequired) setStatus((old) => old ? { ...old, connected: false, verifiedAt: undefined } : old);
        throw new Error(result.error || "Connection check failed.");
      }
      setStatus(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Connection check failed."); }
    finally { setChecking(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason) setError(ERRORS[reason] || "Drive connection failed.");
    fetch("/api/drive/session", { cache: "no-store", signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setStatus).catch((e) => { if (e.name !== "AbortError") setError("Connection status is unavailable. Local records are unchanged."); });
    return () => controller.abort();
  }, []);
  return <main className="ios-app drive-storage">
    <header className="ios-navbar">
      <Link href="/map/" className="drive-back" aria-label="Back to map">&#8592; Map</Link>
      <h1>Storage</h1>
    </header>
    <section className="drive-section">
      <h2>Google Drive</h2>
      <p role="status">{!status ? error ? "Connection unavailable" : "Checking connection..." : status.connected ? "Account connected" : status.configured ? "Not connected" : "Connection setup pending"}</p>
      {status?.email && <p className="drive-account">{status.email}</p>}
      <dl><div><dt>Job records</dt><dd>On this device</dd></div><div><dt>Cloud saving</dt><dd>Not enabled</dd></div></dl>
      {status?.verifiedAt && <p role="status">Connection verified: {new Date(status.verifiedAt).toLocaleString()}</p>}
      {error && <p role="alert" className="drive-error">{error}</p>}
      {status?.connected && <button type="button" onClick={checkConnection} disabled={checking || busy}>{checking ? "Checking..." : "Check connection"}</button>}
      <form action={`/api/drive/${status?.connected ? "disconnect" : "start"}`} method="post" onSubmit={() => setBusy(true)}>
        <button className={status?.connected ? "drive-disconnect" : undefined} disabled={!status?.configured || busy || checking}>{busy ? "Opening..." : status?.connected ? "Disconnect this device" : "Connect Google Drive"}</button>
      </form>
    </section>
  </main>;
}
