"use client";

import { useState } from "react";
import { captureBackup, backupSummary, validateBackup } from "../lib/drive-backup-format.mjs";

const PENDING = "hpd-drive-backup-pending-v1";
type Snapshot = ReturnType<typeof captureBackup>;
type BackupFile = { id: string; name: string; createdTime: string; size: string };
async function api(action: string, body?: unknown) {
  const response = await fetch(`/api/drive/${action}`, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Drive backup request failed.");
  return result;
}

export default function DriveBackups({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Snapshot | null>(null);
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [preview, setPreview] = useState<{ file: BackupFile; snapshot: Snapshot } | null>(null);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Backup failed. Local records kept."); }
    finally { setBusy(false); }
  }
  function prepare() {
    setError(""); setMessage("");
    try {
      const pending = localStorage.getItem(PENDING);
      const snapshot = pending ? validateBackup(JSON.parse(pending).snapshot) : captureBackup(localStorage);
      if (!backupSummary(snapshot).records) throw new Error("No saved job updates on this device. No backup created.");
      setReview(snapshot);
    } catch (e) { setError(e instanceof Error ? e.message : "Local records could not be read."); }
  }
  async function save() {
    if (!review) return;
    await run(async () => {
      const previous = localStorage.getItem(PENDING);
      const pending = previous ? JSON.parse(previous) : { id: (await api("backup-id", {})).id, snapshot: review };
      validateBackup(pending.snapshot);
      if (JSON.stringify(pending.snapshot) !== JSON.stringify(review)) throw new Error("A pending backup changed. Close and review it again.");
      // Persist the ID and exact snapshot before sending, so an interrupted retry cannot duplicate or change it.
      localStorage.setItem(PENDING, JSON.stringify(pending));
      const result = await api("save-backup", pending);
      localStorage.removeItem(PENDING);
      setReview(null);
      setMessage(`${result.jobs} job(s) backed up and read back successfully at ${new Date(result.verifiedAt).toLocaleString()}.`);
      setFiles(null);
    });
  }
  function download() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(preview.snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "HPD-field-records-recovery.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <section className="drive-section">
    <h2>Job update backups</h2>
    <dl><div><dt>Backup mode</dt><dd>Manual</dd></div><div><dt>Automatic sync</dt><dd>Not enabled</dd></div></dl>
    <p>Includes this device&apos;s saved statuses, appointments, workflow notes and visit drafts. Photos, PDFs, signatures, unsaved forms and other devices are not included.</p>
    <div className="drive-actions">
      <button disabled={!connected || busy} onClick={prepare}>Review local backup</button>
      <button className="drive-secondary" disabled={!connected || busy} onClick={() => run(async () => {
        setFiles((await api("backups")).files); setPreview(null);
      })}>View Drive backups</button>
      <button className="drive-secondary" disabled={!connected || busy} onClick={() => run(async () => {
        const result = await api("test-backup", {});
        setMessage(`Drive save and readback passed at ${new Date(result.verifiedAt).toLocaleString()}. Empty HPD TEST file saved; no job records sent.`);
      })}>Test Drive saving</button>
    </div>
    {busy && <p role="status">Working...</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="drive-error">{error}</p>}
    {review && <section className="drive-review" aria-label="Backup review">
      <h3>Review before upload</h3>
      <p>{backupSummary(review).jobs} jobs / {backupSummary(review).records} saved entries</p>
      <p>Captured {new Date(review.capturedAt).toLocaleString()}</p>
      <p>Save these job updates, including tenant contact details in appointments and notes, to your connected Google Drive. A new private recovery file is created; previous backups are kept.</p>
      <div className="drive-actions"><button disabled={busy || !connected} onClick={save}>Save this backup to Drive</button>
      <button className="drive-secondary" disabled={busy} onClick={() => setReview(null)}>Cancel</button></div>
    </section>}
    {files && <div className="drive-backup-list">
      <h3>Saved backups</h3>
      {!files.length && <p>No job backups yet. Test files are excluded.</p>}
      {files.map((file) => <button className="drive-secondary" disabled={busy || !connected} key={file.id} onClick={() => run(async () => {
        const result = await api(`backup?id=${encodeURIComponent(file.id)}`);
        validateBackup(result.snapshot); setPreview(result);
      })}>{new Date(file.createdTime).toLocaleString()}<small>{Math.ceil(Number(file.size || 0) / 1024)} KB</small></button>)}
    </div>}
    {preview && <section className="drive-review" aria-label="Recovery preview">
      <h3>Recovery preview</h3>
      <p>{backupSummary(preview.snapshot).jobs} jobs / {backupSummary(preview.snapshot).records} entries. Integrity verified.</p>
      <p>Captured {new Date(preview.snapshot.capturedAt).toLocaleString()}. No local records changed. In-app merge and conflict resolution are not enabled yet.</p>
      <button onClick={download}>Download recovery file</button>
    </section>}
  </section>;
}
