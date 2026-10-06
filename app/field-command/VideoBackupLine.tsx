"use client";

import { useEffect, useState } from "react";
import { STATUS_EVENT, videoBackupStatus, type VideoBackupStatus } from "../../lib/video-backup";

// Under the Drive backup line: how many of this job's videos are safe in Drive.
export default function VideoBackupLine({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<VideoBackupStatus | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => { videoBackupStatus(jobId).then((next) => { if (live) setStatus(next); }).catch(() => undefined); };
    refresh();
    for (const event of [STATUS_EVENT, "hpd-video-saved", "hpd-drive-backup-status", "focus"]) window.addEventListener(event, refresh);
    return () => { live = false; for (const event of [STATUS_EVENT, "hpd-video-saved", "hpd-drive-backup-status", "focus"]) window.removeEventListener(event, refresh); };
  }, [jobId]);
  if (!status?.total) return null;
  const { total, saved, uploading, error } = status;
  const plural = (n: number) => `${n} video${n === 1 ? "" : "s"}`;
  return (
    <span className={`jc-video-backup ${saved === total ? "is-saved" : ""}`} data-hpd-smoke="jc-video-backup">
      {saved === total
        ? <>🎥 {total === 1 ? "Video" : `All ${total} videos`} saved to Drive</>
        : uploading
          ? <>🎥 Saving a video to Drive… {uploading.percent}% · {saved} of {plural(total)} saved</>
          : error
            ? <>🎥 {saved} of {plural(total)} in Drive · will try again: {error}</>
            : <>🎥 {saved} of {plural(total)} in Drive · the rest go up next (keep the app open)</>}
    </span>
  );
}
