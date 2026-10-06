"use client";

import { useEffect, useState } from "react";
import { FREED_EVENT, freeJobFromPhone, readFreed, type FreedJob } from "../../lib/free-space";
import { formatBytes } from "../../lib/phone-storage";

// Under the Drive package link: the email receipt, and once every video is in the job's Drive
// folder, a button to remove the job's videos from this phone (after you have checked the email).
export default function JobSafeLine({ jobId, emailedAt, emailedTo, inInbox }: { jobId: string; emailedAt: string; emailedTo: string; inInbox: boolean }) {
  const [freed, setFreed] = useState<FreedJob | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setFreed(readFreed()[jobId] || null);
    refresh();
    for (const event of [FREED_EVENT, "focus"]) window.addEventListener(event, refresh);
    return () => { for (const event of [FREED_EVENT, "focus"]) window.removeEventListener(event, refresh); };
  }, [jobId]);
  if (!emailedAt) return null;
  const when = new Date(emailedAt).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" });
  async function remove() {
    setBusy(true);
    setError("");
    try { setFreed(await freeJobFromPhone(jobId)); setAsking(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove the videos."); }
    finally { setBusy(false); }
  }
  return (
    <div className="jc-safe" data-hpd-smoke="jc-safe">
      <span className="is-ok">📧 Emailed {when}{emailedTo ? ` to ${emailedTo}` : ""} ✓{inInbox ? " · in your inbox" : " · Gmail confirmed it was sent"}</span>
      {freed?.waiting ? (
        <span>⏳ {freed.waiting} video{freed.waiting === 1 ? "" : "s"} still going to the job&apos;s Drive folder (keep the app open)</span>
      ) : freed?.ready ? (
        asking ? (
          <span className="jc-safe-confirm">
            Remove this job&apos;s videos and saved package from this phone? The originals stay in the job&apos;s Drive folder; photos stay on the phone.
            <span>
              <button type="button" data-hpd-smoke="jc-free-confirm" disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove from phone"}</button>
              <button type="button" className="is-plain" disabled={busy} onClick={() => setAsking(false)}>Keep</button>
            </span>
          </span>
        ) : (
          <button type="button" className="jc-safe-free" data-hpd-smoke="jc-free" onClick={() => setAsking(true)}>
            ✓ All in Drive · I got the email — free up phone space
          </button>
        )
      ) : freed?.at ? (
        <span className="is-ok">📱 {formatBytes(freed.bytes)} freed on this phone{freed.videos ? ` (${freed.videos} video${freed.videos === 1 ? "" : "s"})` : ""} · originals in the job&apos;s Drive folder</span>
      ) : null}
      {error ? <span className="is-error">⚠ {error}</span> : null}
    </div>
  );
}
