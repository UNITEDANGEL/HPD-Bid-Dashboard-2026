// Drive video backup. The regular backup leaves videos out (they are too big to hold in memory),
// so each video goes to Drive on its own, one at a time, in pieces of a few MB, and an interrupted
// upload carries on from where Google says it stopped. New videos keep their file aside here
// (stored on disk, read piece by piece); older videos are read once from the saved copy.
import { fieldMediaExists, listFieldVideoIds, readFieldMedia, type FieldMedia } from "./field-photo-store";

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
  error?: string;
};
export type { VideoEntry };
export type VideoBackupStatus = { total: number; saved: number; uploading: { id: string; percent: number } | null; error: string };
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

export async function keepVideoForBackup(media: Pick<FieldMedia, "id" | "jobId" | "name" | "type">, blob: Blob) {
  await putEntry({ id: media.id, jobId: media.jobId, name: media.name, type: media.type, blob, total: blob.size });
}

export async function videoBackupStatus(jobId?: string): Promise<VideoBackupStatus> {
  const [ids, entries] = await Promise.all([listFieldVideoIds(jobId), allEntries()]);
  const saved = ids.filter((id) => entries.get(id)?.uploadedAt).length;
  const error = ids.map((id) => entries.get(id)?.error || "").find(Boolean) || "";
  return { total: ids.length, saved, uploading: uploading && ids.includes(uploading.id) ? uploading : null, error };
}

// The bytes start..end of a base64 data URL, decoding only that stretch.
export function base64Bytes(dataUrl: string, start: number, end: number) {
  const offset = dataUrl.indexOf(",") + 1;
  const from = Math.floor(start / 3) * 3;
  const to = Math.ceil(end / 3) * 3;
  const text = atob(dataUrl.slice(offset + (from / 3) * 4, offset + (to / 3) * 4));
  const bytes = new Uint8Array(end - start);
  for (let i = 0; i < bytes.length; i++) bytes[i] = text.charCodeAt(start - from + i);
  return bytes;
}
export function base64Size(dataUrl: string) {
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
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
  // Older video with no kept file: read its saved copy once (the only time it is held in memory).
  let legacy = "";
  if (!entry.blob) {
    const media = await readFieldMedia(id);
    if (!media?.dataUrl) return;
    legacy = media.dataUrl;
    entry = { ...entry, jobId: media.jobId, name: media.name, type: media.type, total: base64Size(legacy) };
  }
  const total = entry.blob ? entry.blob.size : entry.total || 0;
  const piece = async (start: number, end: number) => entry.blob
    ? new Uint8Array(await entry.blob.slice(start, end).arrayBuffer())
    : base64Bytes(legacy, start, end);
  const send = (session: string, start: number, bytes: Uint8Array) => api("video-piece", {
    headers: { "Content-Type": "application/octet-stream", "X-HPD-Session": encodeURIComponent(session), "X-HPD-Start": String(start), "X-HPD-Total": String(total) },
    body: new Blob([bytes as BlobPart]),
  }).then(answer);
  const finish = async (driveFileId: string) => {
    // Saved: let go of the kept file; the video itself stays in the job until it is cleared.
    entry = { id, jobId: entry.jobId, name: entry.name, type: entry.type, total, uploadedAt: new Date().toISOString(), driveFileId };
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
  const work = async () => {
    const [ids, entries] = await Promise.all([listFieldVideoIds(), allEntries()]);
    for (const id of ids) {
      if (!shouldContinue()) return;
      if (entries.get(id)?.uploadedAt) continue;
      await backupOne(id, api, shouldContinue);
    }
  };
  if (!navigator.locks) return work();
  await navigator.locks.request("hpd-video-backup", { mode: "exclusive", ifAvailable: true }, async (lock) => { if (lock) await work(); });
}
