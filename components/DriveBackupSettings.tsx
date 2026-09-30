"use client";

import { useEffect, useState } from "react";
import { AUTO_KEY, SYNC_KEY, backupState, runFullBackup, syncMissingRecords, withBackupLock } from "../lib/drive-backup-client.mjs";

export default function DriveBackupSettings({ connected }: { connected: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const refresh = () => {
      try { setEnabled(localStorage.getItem(AUTO_KEY) === "on"); setSyncEnabled(localStorage.getItem(SYNC_KEY) === "on"); } catch { setError("Device storage is unavailable."); }
      setOnline(navigator.onLine);
      backupState().then((next) => { setState(next); if (!next.queued && next.verifiedAt && !next.error) setError(""); }).catch(() => setError("Backup queue is unavailable on this device."));
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    for (const event of ["hpd-drive-backup-status", "storage", "online", "offline"]) window.addEventListener(event, refresh);
    return () => { clearInterval(timer); for (const event of ["hpd-drive-backup-status", "storage", "online", "offline"]) window.removeEventListener(event, refresh); };
  }, []);
  function toggle(value: boolean) {
    try {
      localStorage.setItem(AUTO_KEY, value ? "on" : "off"); setEnabled(value); setError("");
      window.dispatchEvent(new Event("hpd-drive-backup-settings"));
    } catch { setError("Could not save the backup preference. Nothing enabled."); }
  }
  return <section className="drive-section">
    <h2>Automatic backup</h2>
    <label className="drive-toggle"><span>Save this device to Drive</span><input type="checkbox" checked={enabled} disabled={!connected || busy} onChange={(e) => toggle(e.target.checked)} /></label>
    <label className="drive-toggle"><span>Download missing Drive records to this device</span><input type="checkbox" checked={syncEnabled} disabled={!connected || busy} onChange={(e) => {
      try { localStorage.setItem(SYNC_KEY, e.target.checked ? "on" : "off"); setSyncEnabled(e.target.checked); if (e.target.checked) toggle(true); }
      catch { setError("Could not save sync preference."); }
    }} /></label>
    <p>Saved job updates, today's route, photos, videos, visit records and generated PDF/ZIP packages. Checks every minute while the app is open and visible; retries after reconnecting. Unsaved forms and route starting locations are excluded.</p>
    <dl><div><dt>Automatic backup</dt><dd>{!enabled ? "Off" : !connected ? "Reconnect required" : !online ? "Waiting for internet" : "On while app is open"}</dd></div>
    <div><dt>Download missing records</dt><dd>{syncEnabled ? "On; conflicting edits require review" : "Off"}</dd></div></dl>
    {state?.sync?.checkedAt && <p>Drive checked: {new Date(state.sync.checkedAt).toLocaleString()}. {state.sync.added} records downloaded. {state.sync.conflicts} conflicting versions retained for review. Reload the map to show downloaded records.</p>}
    {state?.sync?.error && <p role="alert" className="drive-error">{state.sync.error}</p>}
    {state?.verifiedAt && <p role="status">Last full backup: {new Date(state.verifiedAt).toLocaleString()}<br />{state.summary?.jobs || 0} jobs, {state.summary?.routes || 0} routes, {state.summary?.media || 0} media, {state.summary?.documents || 0} packages</p>}
    {state?.queued > 0 && <p role="status">{state.queued} backup parts pending. Local files are retained until verification.</p>}
    {(error || state?.error) && <p role="alert" className="drive-error">{state?.error || error}</p>}
    <button disabled={!connected || busy || !online} onClick={async () => {
      setBusy(true); setError("");
      try { setState(await withBackupLock(async () => {
        await runFullBackup();
        if (syncEnabled) await syncMissingRecords();
        return runFullBackup();
      })); }
      catch (e) { setError(e instanceof Error ? e.message.includes("Another app tab") ? "" : e.message : "Backup failed. Local records kept."); }
      finally { setBusy(false); window.dispatchEvent(new Event("hpd-drive-backup-status")); }
    }}>{busy ? "Saving and verifying..." : syncEnabled ? "Sync now" : "Back up everything now"}</button>
    <p>Previous versions stay in Drive. Restore adds missing records; conflicting versions stay separate. Limit: 128 MB per full backup. Google Drive storage limits still apply.</p>
  </section>;
}
