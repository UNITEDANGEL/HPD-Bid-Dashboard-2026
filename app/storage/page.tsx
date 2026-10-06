"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DriveBackups from "../../components/DriveBackups";
import DriveBackupSettings from "../../components/DriveBackupSettings";
import { formatBytes, keepAppData, phoneStorage, type PhoneStorage } from "../../lib/phone-storage";
import "../ios-app.css";
import "./storage.css";

type Status = { configured: boolean; connected: boolean; email?: string; verifiedAt?: string; canEmail?: boolean; syncEnabled: boolean };
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
  const [version, setVersion] = useState("");
  const [space, setSpace] = useState<PhoneStorage | null>(null);
  const [keepAsked, setKeepAsked] = useState(false);
  async function askToKeep() {
    setKeepAsked(true);
    await keepAppData();
    setSpace(await phoneStorage());
  }
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
    void phoneStorage().then(setSpace);
    fetch("/version.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null)
      .then((v) => { if (v?.commit) setVersion(`${v.commit} · ${new Date(v.builtAt).toLocaleString()}`); }).catch(() => {});
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
      <dl><div><dt>Working records</dt><dd>On this device</dd></div><div><dt>Drive backups</dt><dd>{status?.connected ? "Available below" : "Connect first"}</dd></div><div><dt>Email packages</dt><dd>{!status?.connected ? "Connect first" : status.canEmail ? "Allowed" : "Not allowed"}</dd></div></dl>
      {status?.connected && !status.canEmail && <p role="alert" className="drive-error">Email sending is not allowed for this connection. Make sure the Gmail API and the gmail.send scope are set up in Google Cloud, then tap Disconnect, Connect, and tick &quot;Send email on your behalf&quot;.</p>}
      {status?.verifiedAt && <p role="status">Connection verified: {new Date(status.verifiedAt).toLocaleString()}</p>}
      {error && <p role="alert" className="drive-error">{error}</p>}
      {status?.connected && <button type="button" onClick={checkConnection} disabled={checking || busy}>{checking ? "Checking..." : "Check connection"}</button>}
      <form action={`/api/drive/${status?.connected ? "disconnect" : "start"}`} method="post" onSubmit={() => setBusy(true)}>
        <button className={status?.connected ? "drive-disconnect" : undefined} disabled={!status?.configured || busy || checking}>{busy ? "Opening..." : status?.connected ? "Disconnect this device" : "Connect Google Drive"}</button>
      </form>
    </section>
    <section className="drive-section" data-hpd-smoke="phone-space">
      <h2>This phone</h2>
      {!space ? <p>This browser does not report its storage.</p> : <>
        <div className={`phone-space-bar is-${space.level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={space.percent} aria-label="App space used"><span style={{ width: `${Math.min(100, Math.max(2, space.percent))}%` }} /></div>
        <dl>
          <div><dt>Used by the app</dt><dd>{formatBytes(space.usage)}</dd></div>
          <div><dt>Left for the app</dt><dd>{formatBytes(space.free)}</dd></div>
          <div><dt>Kept safe on this phone</dt><dd>{space.persisted === null ? "Not reported" : space.persisted ? "Yes ✓" : "Not yet"}</dd></div>
        </dl>
        {space.level !== "ok" && <p role="alert" className="drive-error">{space.level === "full" ? "Almost out of space: new photos and videos may not save." : "Space is running low."} Send the packages for finished jobs, then clear their photos and videos, or free up space in iPhone Settings › General › iPhone Storage.</p>}
        {space.persisted === false && <>
          <p>The phone may clear the app&apos;s saved jobs, photos and videos when it runs low on space. Turn on the Drive backup above, and add the app to your Home Screen (Share › Add to Home Screen) so the phone keeps them.</p>
          <button type="button" onClick={() => void askToKeep()} disabled={keepAsked}>{keepAsked ? "Asked the phone" : "Ask the phone to keep the app's data"}</button>
        </>}
      </>}
    </section>
    <DriveBackupSettings connected={Boolean(status?.connected)} />
    <DriveBackups connected={Boolean(status?.connected)} />
    <p className="drive-version">App version {version || "unknown"}</p>
  </main>;
}
