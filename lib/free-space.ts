// Once a job is safe (its package was saved to Drive and emailed, and every video's original is in
// Drive), each original is moved into the job's package folder ("Original videos") so the job's
// Drive folder holds everything, and the job card offers a button to remove the job's videos and
// saved package zip from this phone. Nothing is removed until you tap it, and the button only
// appears when every piece is confirmed in Drive. Photos stay (small, shown on the job card).
import { freeFieldVideo, listFieldVideoIds } from "./field-photo-store";
import { clearFieldPackets, listFieldPackets } from "./field-packet-store";
import { getVideoEntry, saveVideoEntry } from "./video-backup";

const OVERRIDES_KEY = "hpd-job-workflow-overrides-v2";
export const FREED_KEY = "hpd-phone-freed-v1";
export const FREED_EVENT = "hpd-phone-freed";
// ready: every video is in the job's Drive folder, so the phone's copies can be removed.
// at/videos/bytes: what was removed, once you tapped the button.
export type FreedJob = { at: string; videos: number; bytes: number; waiting: number; ready: boolean; onPhone: number };
type Api = (action: string, init: RequestInit) => Promise<Response>;

export function driveFolderId(link: string) {
  return /\/folders\/([A-Za-z0-9_-]{10,200})/.exec(String(link || ""))?.[1] || "";
}

// Jobs whose package went to Drive and was emailed (from the job steps saved on this phone).
export function sentJobs(raw: string | null): { jobId: string; folderId: string }[] {
  let rows: Record<string, Record<string, unknown>> = {};
  try { rows = raw ? JSON.parse(raw) : {}; } catch { return []; }
  return Object.entries(rows)
    .filter(([, row]) => row && row.PackageEmailedAt && driveFolderId(String(row.PackageDriveLink || "")))
    .map(([jobId, row]) => ({ jobId, folderId: driveFolderId(String(row.PackageDriveLink)) }));
}

export function readFreed(): Record<string, FreedJob> {
  try { return JSON.parse(localStorage.getItem(FREED_KEY) || "{}") || {}; } catch { return {}; }
}
function writeFreed(jobId: string, value: FreedJob) {
  try { localStorage.setItem(FREED_KEY, JSON.stringify({ ...readFreed(), [jobId]: value })); } catch {}
}

const defaultApi: Api = (action, init) => fetch(`/api/drive/${action}`, { ...init, method: "POST", signal: AbortSignal.timeout(60000) });

// Automatic (with the Drive backup): files each sent job's originals into its Drive folder and
// works out whether the job is ready to be removed from the phone. Removes nothing.
export async function prepareSentJobs({ api = defaultApi, shouldContinue = () => true }: { api?: Api; shouldContinue?: () => boolean } = {}) {
  let changed = false;
  for (const { jobId, folderId } of sentJobs(localStorage.getItem(OVERRIDES_KEY))) {
    if (!shouldContinue()) break;
    const before = readFreed()[jobId] || { at: "", videos: 0, bytes: 0, waiting: 0, ready: false, onPhone: 0 };
    let waiting = 0;
    let onPhone = 0;
    for (const id of await listFieldVideoIds(jobId)) {
      if (!shouldContinue()) return;
      const entry = await getVideoEntry(id);
      // Not in Drive yet (the video backup sends it first).
      if (!entry?.uploadedAt || !entry.driveFileId) { waiting += 1; onPhone += 1; continue; }
      if (entry.packageFolderId !== folderId) {
        const response = await api("video-to-package", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: entry.driveFileId, folderId }) });
        if (!response.ok) { waiting += 1; onPhone += 1; continue; }
        await saveVideoEntry({ ...entry, packageFolderId: folderId });
      }
      if (!entry.freedAt) onPhone += 1;
    }
    const zips = (await listFieldPackets(jobId)).filter((packet) => packet.packetType === "full_evidence_zip").length;
    const next = { ...before, waiting, onPhone: onPhone + zips, ready: !waiting && onPhone + zips > 0 };
    if (JSON.stringify(next) !== JSON.stringify(before)) { writeFreed(jobId, next); changed = true; }
  }
  if (changed) window.dispatchEvent(new Event(FREED_EVENT));
}

// The button on the job card: removes the job's videos (originals are in its Drive folder) and the
// saved package zip from this phone. Only for a job that is ready (checked again here).
export async function freeJobFromPhone(jobId: string) {
  const job = sentJobs(localStorage.getItem(OVERRIDES_KEY)).find((row) => row.jobId === jobId);
  if (!job) throw new Error("This job's package has not been saved to Drive and emailed yet.");
  const ids = await listFieldVideoIds(jobId);
  const entries = await Promise.all(ids.map((id) => getVideoEntry(id)));
  if (entries.some((entry) => !entry?.uploadedAt || !entry.driveFileId || entry.packageFolderId !== job.folderId)) {
    throw new Error("Not every video is in the job's Drive folder yet. Keep the app open with Drive backup on, then try again.");
  }
  const before = readFreed()[jobId] || { at: "", videos: 0, bytes: 0, waiting: 0, ready: false, onPhone: 0 };
  let { videos, bytes } = before;
  for (let i = 0; i < ids.length; i++) {
    const entry = entries[i]!;
    const freed = await freeFieldVideo(ids[i], entry.driveFileId!);
    if (freed) { videos += 1; bytes += freed; }
    await saveVideoEntry({ ...entry, freedAt: new Date().toISOString() });
  }
  const zips = (await listFieldPackets(jobId)).filter((packet) => packet.packetType === "full_evidence_zip");
  bytes += zips.reduce((sum, packet) => sum + Math.round((String(packet.dataUrl || "").length * 3) / 4), 0);
  if (zips.length) await clearFieldPackets(jobId, ["full_evidence_zip"]);
  const result = { at: new Date().toISOString(), videos, bytes, waiting: 0, ready: false, onPhone: 0 };
  writeFreed(jobId, result);
  window.dispatchEvent(new Event(FREED_EVENT));
  return result;
}
