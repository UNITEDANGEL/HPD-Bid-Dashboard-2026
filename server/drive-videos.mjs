// Video backup: each job video goes to Drive (HPD Video Backup / <job>) in small pieces, so the
// phone never has to hold a whole video in memory and an interrupted upload picks up where it
// stopped. Only reachable through handleDriveAuth, after the owner/session/Google identity checks.

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const ROOT_KIND = "hpd-video-root";
// Photos go up one at a time the same way, into their own backup folder.
const PHOTO_ROOT_KIND = "hpd-photo-root";
const JOB_KIND = "hpd-video-job";
const FILE_KIND = "hpd-video-file";
// The package folders made by drive-packages.mjs (one per job package).
const PACKAGE_FOLDER_KIND = "hpd-package-folder";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
// Google needs every piece but the last to be a multiple of 256 KB.
export const VIDEO_PIECE = 256 * 1024;
const MAX_PIECE_BYTES = 8 * 1024 * 1024;
const SESSION_URL = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?[^\s#]*upload_id=[\w-]+[^\s#]*$/;
const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
const reply = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function fail(message, status = 503) { const error = new Error(message); error.status = status; throw error; }
const cleanName = (value, fallback) => String(value || "").replace(/[\u0000-\u001f\\/]+/g, "-").trim().slice(0, 180) || fallback;
const quote = (value) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// Where Google says the upload has got to: "bytes=0-1048575" means 1048576 bytes are saved.
function savedBytes(response) {
  const match = /bytes=0-(\d+)/.exec(response.headers.get("Range") || "");
  return match ? Number(match[1]) + 1 : 0;
}

export async function handleDriveVideos(request, action, authHeaders, fetcher) {
  const call = (url, options = {}) => fetcher(url, { ...options, headers: { ...authHeaders, ...options.headers }, signal: AbortSignal.timeout(90000) });
  const findOne = async (q) => {
    const response = await call(`${DRIVE}/files?${new URLSearchParams({ q: `trashed = false and 'me' in owners and ${q}`, fields: "files(id)", pageSize: "1" })}`);
    if (!response.ok) fail(`Could not read Google Drive (HTTP ${response.status}).`);
    return (await response.json()).files?.[0]?.id || "";
  };
  const folder = async (name, kind, parent) => {
    const found = await findOne(`mimeType = '${FOLDER_MIME}' and appProperties has { key='hpdKind' and value='${kind}' }${parent ? ` and '${parent}' in parents and name = '${quote(name)}'` : ""}`);
    if (found) return found;
    const response = await call(`${DRIVE}/files?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}), appProperties: { hpdKind: kind } }),
    });
    if (!response.ok) fail(`Could not create the Drive folder (HTTP ${response.status}).`);
    const { id } = await response.json();
    if (!validId(id)) fail("Drive did not return the folder.");
    return id;
  };

  try {
    if (action === "video-start") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail("JSON request required.", 415);
      let body;
      try { body = JSON.parse(await request.text()); } catch { fail("Invalid request.", 400); }
      const mediaId = String(body.mediaId || "");
      const size = Number(body.size);
      if (!/^[\w:.+-]{1,100}$/.test(mediaId)) fail("Invalid video id.", 400);
      if (!Number.isInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES) fail("Invalid video size.", 400);
      const photo = /^image\/[\w.+-]+$/.test(body.mimeType || "");
      const mimeType = photo || /^video\/[\w.+-]+$/.test(body.mimeType || "") ? body.mimeType : "video/mp4";
      const root = photo ? await folder("HPD Photo Backup", PHOTO_ROOT_KIND) : await folder("HPD Video Backup", ROOT_KIND);
      const job = await folder(cleanName(body.jobId, "Other"), JOB_KIND, root);
      // Already saved (the phone lost track, or a second phone): never upload it twice.
      const existing = await findOne(`'${job}' in parents and appProperties has { key='hpdMediaId' and value='${quote(mediaId)}' }`);
      if (existing) return reply({ done: true, id: existing });
      const start = await call(`${UPLOAD}?uploadType=resumable&fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(size) },
        body: JSON.stringify({ name: cleanName(body.name, `${mediaId}.mp4`), parents: [job], appProperties: { hpdKind: FILE_KIND, hpdMediaId: mediaId } }),
      });
      const session = start.headers.get("Location") || "";
      if (!start.ok || !SESSION_URL.test(session)) fail(`Drive upload could not start (HTTP ${start.status}).`);
      return reply({ session });
    }

    if (action === "video-piece") {
      let session;
      try { session = decodeURIComponent(request.headers.get("X-HPD-Session") || ""); } catch { fail("Invalid upload.", 400); }
      if (!SESSION_URL.test(session)) fail("Invalid upload.", 400);
      const start = Number(request.headers.get("X-HPD-Start"));
      const total = Number(request.headers.get("X-HPD-Total"));
      if (!Number.isInteger(total) || total <= 0 || total > MAX_VIDEO_BYTES || !Number.isInteger(start) || start < 0 || start >= total) fail("Invalid upload range.", 400);
      if (Number(request.headers.get("Content-Length")) > MAX_PIECE_BYTES) fail("Piece is too large.", 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > MAX_PIECE_BYTES) fail("Piece is too large.", 413);
      const end = start + bytes.byteLength;
      if (end > total || (bytes.byteLength && end < total && bytes.byteLength % VIDEO_PIECE)) fail("Invalid upload range.", 400);
      // An empty piece asks Google how much it already has (after an interruption).
      const range = bytes.byteLength ? `bytes ${start}-${end - 1}/${total}` : `bytes */${total}`;
      const response = await call(session, { method: "PUT", headers: { "Content-Range": range }, ...(bytes.byteLength ? { body: bytes } : {}) });
      if (response.status === 200 || response.status === 201) {
        const file = await response.json();
        return reply({ done: true, id: file.id });
      }
      if (response.status === 308) return reply({ saved: savedBytes(response) });
      if (response.status === 404 || response.status === 410) return reply({ expired: true }, 410);
      fail(`Drive upload failed (HTTP ${response.status}).`);
    }

    if (action === "video-to-package") {
      // Moves an original video from the backup folder into its job's package folder
      // ("Original videos"), so the job's folder holds everything. Only this app's own files.
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail("JSON request required.", 415);
      let body;
      try { body = JSON.parse(await request.text()); } catch { fail("Invalid request.", 400); }
      const fileId = String(body.fileId || "");
      const folderId = String(body.folderId || "");
      if (!validId(fileId) || !validId(folderId)) fail("Invalid video or folder.", 400);
      const read = async (id, fields) => {
        const response = await call(`${DRIVE}/files/${id}?fields=${fields}`);
        if (!response.ok) fail(`Could not read Google Drive (HTTP ${response.status}).`, response.status === 404 ? 404 : 503);
        return response.json();
      };
      const file = await read(fileId, "id,parents,ownedByMe,trashed,appProperties");
      if (!file.ownedByMe || file.trashed || file.appProperties?.hpdKind !== FILE_KIND) fail("Not a video backup of this app.", 403);
      const target = await read(folderId, "id,mimeType,ownedByMe,trashed,appProperties");
      if (!target.ownedByMe || target.trashed || target.mimeType !== FOLDER_MIME || target.appProperties?.hpdKind !== PACKAGE_FOLDER_KIND) fail("Not an HPD package folder owned by this account.", 403);
      const originals = await folder("Original videos", PACKAGE_FOLDER_KIND, folderId);
      const parents = Array.isArray(file.parents) ? file.parents : [];
      if (parents.includes(originals)) return reply({ moved: true, folderId: originals });
      const query = new URLSearchParams({ addParents: originals, fields: "id,parents", ...(parents.length ? { removeParents: parents.join(",") } : {}) });
      const moved = await call(`${DRIVE}/files/${fileId}?${query}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!moved.ok) fail(`Could not move the video into the job folder (HTTP ${moved.status}).`);
      return reply({ moved: true, folderId: originals });
    }

    fail("Not found.", 404);
  } catch (e) {
    return reply({ error: e.status ? e.message : "Video backup failed. The video is still on this phone." }, e.status || 503);
  }
}
