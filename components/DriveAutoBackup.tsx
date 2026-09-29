"use client";

import { useEffect } from "react";
import { AUTO_KEY, driveApi, runFullBackup, withBackupLock } from "../lib/drive-backup-client.mjs";

export default function DriveAutoBackup() {
  useEffect(() => {
    let working = false; let stopped = false;
    const enabled = () => !stopped && localStorage.getItem(AUTO_KEY) === "on" && navigator.onLine && document.visibilityState === "visible";
    async function tick() {
      if (working) return;
      try {
        if (!enabled()) return;
        working = true;
        const session = await driveApi("session");
        if (!session.connected || !enabled()) return;
        await withBackupLock(() => runFullBackup({ shouldContinue: enabled }));
      } catch { /* Queue and previous files remain intact; storage screen displays failures. */ }
      finally { working = false; window.dispatchEvent(new Event("hpd-drive-backup-status")); }
    }
    void tick();
    const timer = window.setInterval(tick, 60000);
    for (const event of ["focus", "online", "hpd-drive-backup-settings"]) window.addEventListener(event, tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true; clearInterval(timer);
      for (const event of ["focus", "online", "hpd-drive-backup-settings"]) window.removeEventListener(event, tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return null;
}
