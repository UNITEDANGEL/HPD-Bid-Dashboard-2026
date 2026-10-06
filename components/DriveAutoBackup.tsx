"use client";

import { useEffect } from "react";
import { AUTO_KEY, SYNC_KEY, driveApi, runFullBackup, syncMissingRecords, withBackupLock } from "../lib/drive-backup-client.mjs";
import { backupVideos } from "../lib/video-backup";

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
        try {
          await withBackupLock(async () => {
            await runFullBackup({ shouldContinue: enabled });
            if (localStorage.getItem(SYNC_KEY) === "on") {
              await syncMissingRecords({ shouldContinue: enabled });
              if (enabled()) await runFullBackup({ shouldContinue: enabled });
            }
          });
        } finally {
          // Videos last, one at a time in small pieces (the backup above leaves them out), even
          // when that backup failed this time.
          if (enabled()) await backupVideos({ shouldContinue: enabled });
        }
      } catch { /* Queue and previous files remain intact; storage screen displays failures. */ }
      finally { working = false; window.dispatchEvent(new Event("hpd-drive-backup-status")); }
    }
    void tick();
    const timer = window.setInterval(tick, 60000);
    for (const event of ["focus", "online", "hpd-drive-backup-settings", "hpd-video-saved"]) window.addEventListener(event, tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true; clearInterval(timer);
      for (const event of ["focus", "online", "hpd-drive-backup-settings", "hpd-video-saved"]) window.removeEventListener(event, tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return null;
}
