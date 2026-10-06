// Drive video backup. The regular backup leaves videos out (they are too big to hold in memory),
// so each video goes to Drive on its own, one at a time, in pieces of a few MB, and an interrupted
// upload carries on from where Google says it stopped. New videos keep their file aside here
// (stored on disk, read piece by piece). Older videos (saved before this backup existed) are never
// read in the background, since a whole video in memory closes the app on an iPhone; they go to
// Drive with the package.
import { dataUrlToBytes, fieldMediaExists, listFieldPhotoIds, listFieldVideoIds, readFieldMedia, type FieldMedia } from "./field-photo-store";

type VideoEntry = {
  id: string;
  jobId: string;
  name?: string;
  type?: string;
  blob?: Blob;
  session?: string;
  saved?: number;
  total?: number;
  uploadedAt?: string;
  driveFileId?: string;
  // The job's package folder the original was moved into (so the job's Drive folder has it).
  packageFolderId?: string;
  // Removed from this phone (you tapped the button on the job card).
  freedAt?: string;
  // The video's details (everything but the video itself), so it can be removed from the phone
  // later without reading the video into memory.
  meta?: Omit<FieldMedia, "dataUrl">;
  error?: string;
};
export type { VideoEntry };
// older: videos saved before the automatic video backup (no kept file); they go to Drive with the
// package, never read in the background. paused: the crash guard stopped the video backup.
export type VideoBackupStatus = { total: number; saved: number; older: number; paused: boolean; uploading: { id: string; percent: number } | null; error: string };
type Api = (action: string, init: RequestInit) => Promise<Response>;

const DB_NAME = "hpd-video-backup-v1";
const STORE = "videos";
// 7.5 MB: a multiple of Google's 256 KB step and of 3, so older (base64) videos split cleanly.
export const PIECE_BYTES = 30 * 256 * 1024;
export const STATUS_EVENT = "hpd-video-backup-status";
let uploading: { id: string; percent: number } | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    return await new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve((request ? request.result : undefined) as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
const getEntry = (id: string) => run<VideoEntry | undefined>("readonly", (store) => store.get(id));
const putEntry = (entry: VideoEntry) => run<void>("readwrite", (store) => { store.put(entry); });
const dropEntry = (id: string) => run<void>("readwrite", (store) => { store.delete(id); });
const allEntries = async () => {
  // Blobs come back as handles to files on disk: listing them does not read the videos.
  const rows = await run<VideoEntry[]>("readonly", (store) => store.getAll());
  return new Map((rows || []).map((row) => [row.id, row]));
};
const announce = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(STATUS_EVENT)); };

export const getVideoEntry = getEntry;
export const saveVideoEntry = putEntry;

// Start over: forget the job's videos here too (and any file kept aside for upload).
export async function forgetJobVideos(jobId: string) {
  const entries = await allEntries();
  await run<void>("readwrite", (store) => { for (const entry of entries.values()) if (entry.jobId === jobId) store.delete(entry.id); });
}

export async function keepVideoForBackup(media: FieldMedia, blob: Blob) {
  const { dataUrl: _video, ...meta } = media;
  await putEntry({ id: media.id, jobId: media.jobId, name: media.name, type: media.type, blob, total: blob.size, meta });
}

// Crash guard: if the app closes while a video is going up, the next start pauses the video backup
// (the card offers Resume) instead of trying the same thing again.
export const VIDEO_RUNNING_KEY = "hpd-video-backup-running";
export const VIDEO_PAUSED_KEY = "hpd-video-backup-paused";
export function videoBackupPaused() {
  try { return Boolean(localStorage.getItem(VIDEO_PAUSED_KEY)); } catch { return false; }
}
export function resumeVideoBackup() {
  try { localStorage.removeItem(VIDEO_PAUSED_KEY); localStorage.removeItem(VIDEO_RUNNING_KEY); } catch {}
  window.dispatchEvent(new Event("hpd-drive-backup-settings"));
  announce();
}
// At app start: a "running" mark left over means the app closed during a video upload.
export function checkVideoBackupCrash() {
  try {
    if (localStorage.getItem(VIDEO_RUNNING_KEY)) {
      localStorage.setItem(VIDEO_PAUSED_KEY, new Date().toISOString());
      localStorage.removeItem(VIDEO_RUNNING_KEY);
    }
  } catch {}
}

export async function videoBackupStatus(jobId?: string): Promise<VideoBackupStatus> {
  const [ids, entries] = await Promise.all([listFieldVideoIds(jobId), allEntries()]);
  const saved = ids.filter((id) => entries.get(id)?.uploadedAt).length;
  const older = ids.filter((id) => !entries.get(id)?.uploadedAt && !entries.get(id)?.blob).length;
  const error = ids.map((id) => entries.get(id)?.error || "").find(Boolean) || "";
  return { total: ids.length, saved, older, paused: videoBackupPaused(), uploading: uploading && ids.includes(uploading.id) ? uploading : null, error };
}

const defaultApi: Api = (action, init) => fetch(`/api/drive/${action}`, { ...init, method: "POST", signal: AbortSignal.timeout(120000) });
async function answer(response: Response) {
  let body: Record<string, unknown> = {};
  try { body = await response.json(); } catch {}
  if (!response.ok && !body.expired) throw new Error(String(body.error || `Drive video backup failed (HTTP ${response.status}).`));
  return body;
}

async function backupOne(id: string, api: Api, shouldContinue: () => boolean) {
  if (!(await fieldMediaExists(id))) { await dropEntry(id).catch(() => undefined); return; }
  let entry: VideoEntry = (await getEntry(id)) || { id, jobId: "" };
  if (entry.uploadedAt) return;
  // Older video with no kept file: never read in the background (reading a big video into memory
  // closes the app on an iPhone). It goes to Drive with the package.
  if (!entry.blob) return;
  const blob = entry.blob;
  const total = blob.size;
  const piece = async (start: number, end: number) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
  const send = (session: string, start: number, bytes: Uint8Array) => api("video-piece", {
    headers: { "Content-Type": "application/octet-stream", "X-HPD-Session": encodeURIComponent(session), "X-HPD-Start": String(start), "X-HPD-Total": String(total) },
    body: new Blob([bytes as BlobPart]),
  }).then(answer);
  const finish = async (driveFileId: string) => {
    // Saved: let go of the kept file; the video itself stays in the job until it is cleared.
    entry = { id, jobId: entry.jobId, name: entry.name, type: entry.type, total, uploadedAt: new Date().toISOString(), driveFileId, meta: entry.meta };
    await putEntry(entry);
  };

  uploading = { id, percent: 0 };
  announce();
  try {
    let saved = 0;
    if (entry.session) {
      const where = await send(entry.session, 0, new Uint8Array(0));
      if (where.done) return await finish(String(where.id));
      if (where.expired) entry.session = undefined;
      else saved = Number(where.saved) || 0;
    }
    if (!entry.session) {
      const started = await api("video-start", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: id, jobId: entry.jobId, name: entry.name, mimeType: entry.type, size: total }),
      }).then(answer);
      if (started.done) return await finish(String(started.id));
      if (typeof started.session !== "string" || !started.session.startsWith("https://")) throw new Error("Drive did not start the video upload.");
      entry = { ...entry, session: String(started.session), saved: 0, error: "" };
      await putEntry(entry);
      saved = 0;
    }
    while (saved < total) {
      if (!shouldContinue()) return;
      const end = Math.min(total, saved + PIECE_BYTES);
      const result = await send(entry.session!, saved, await piece(saved, end));
      if (result.done) return await finish(String(result.id));
      if (result.expired) { entry = { ...entry, session: undefined, saved: 0 }; await putEntry(entry); return; }
      const now = Number(result.saved) || 0;
      // Google must have taken more of the video; otherwise stop and try again next time.
      if (now <= saved) throw new Error("Drive did not take the last piece.");
      saved = now;
      entry = { ...entry, saved, error: "" };
      await putEntry(entry);
      uploading = { id, percent: Math.floor((saved / total) * 100) };
      announce();
    }
  } catch (error) {
    entry = { ...entry, error: error instanceof Error ? error.message : "Video backup failed." };
    await putEntry(entry).catch(() => undefined);
    throw error;
  } finally {
    uploading = null;
    announce();
  }
}

// Backs up every video not yet in Drive, oldest first, one at a time. Stops when told to (app
// hidden, offline, backup turned off) and carries on next time.
export async function backupVideos({ api = defaultApi, shouldContinue = () => true }: { api?: Api; shouldContinue?: () => boolean } = {}) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
  if (connection?.saveData || connection?.type === "cellular") return;
  if (videoBackupPaused()) return;
  const work = async () => {
    const [ids, entries] = await Promise.all([listFieldVideoIds(), allEntries()]);
    for (const id of ids) {
      if (!shouldContinue()) return;
      const entry = entries.get(id);
      if (entry?.uploadedAt || !entry?.blob) continue;
      try { localStorage.setItem(VIDEO_RUNNING_KEY, id); } catch {}
      try { await backupOne(id, api, shouldContinue); }
      finally { try { localStorage.removeItem(VIDEO_RUNNING_KEY); } catch {} }
    }
  };
  if (!navigator.locks) return work();
  await navigator.locks.request("hpd-video-backup", { mode: "exclusive", ifAvailable: true }, async (lock) => { if (lock) await work(); });
}

// Photos: each one goes to Drive (HPD Photo Backup / <job>) once, read one at a time (a photo is
// small), so the every-minute backup never has to hold all photos at once.
async function backupPhoto(id: string, api: Api) {
  const media = await readFieldMedia(id);
  if (!media?.dataUrl || media.mediaType !== "image") return;
  const bytes = dataUrlToBytes(media.dataUrl);
  const total = bytes.byteLength;
  if (!total) return;
  try {
    const started = await api("video-start", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: id, jobId: media.jobId, name: media.name, mimeType: media.type || "image/jpeg", size: total }),
    }).then(answer);
    let driveFileId = started.done ? String(started.id) : "";
    if (!driveFileId) {
      if (typeof started.session !== "string" || !started.session.startsWith("https://")) throw new Error("Drive did not start the photo upload.");
      let saved = 0;
      while (saved < total) {
        const end = Math.min(total, saved + PIECE_BYTES);
        const result = await api("video-piece", {
          headers: { "Content-Type": "application/octet-stream", "X-HPD-Session": encodeURIComponent(started.session), "X-HPD-Start": String(saved), "X-HPD-Total": String(total) },
          body: new Blob([bytes.subarray(saved, end) as BlobPart]),
        }).then(answer);
        if (result.done) { driveFileId = String(result.id); break; }
        const now = Number(result.saved) || 0;
        if (result.expired || now <= saved) throw new Error("Drive did not take the photo.");
        saved = now;
      }
    }
    await putEntry({ id, jobId: media.jobId, name: media.name, type: media.type, total, uploadedAt: new Date().toISOString(), driveFileId });
  } catch (error) {
    await putEntry({ id, jobId: media.jobId, error: error instanceof Error ? error.message : "Photo backup failed." }).catch(() => undefined);
    throw error;
  }
}

export async function backupPhotos({ api = defaultApi, shouldContinue = () => true }: { api?: Api; shouldContinue?: () => boolean } = {}) {
  if (videoBackupPaused()) return;
  const [ids, entries] = await Promise.all([listFieldPhotoIds(), allEntries()]);
  for (const id of ids) {
    if (!shouldContinue()) return;
    if (entries.get(id)?.uploadedAt) continue;
    try { localStorage.setItem(VIDEO_RUNNING_KEY, id); } catch {}
    try { await backupPhoto(id, api); }
    // A photo Drive refused: try again next time, and let the videos go now.
    catch { return; }
    finally { try { localStorage.removeItem(VIDEO_RUNNING_KEY); } catch {} }
  }
}
