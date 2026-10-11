// Synthetic Google mocks only: no real Drive files.
import assert from "node:assert/strict";
import { handleDriveVideos, VIDEO_PIECE } from "../server/drive-videos.mjs";

const auth = { Authorization: "Bearer test-access" };
const SESSION = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test_upload_1";
const req = (action, body, headers = {}) => new Request(`https://app.example.test/api/drive/${action}`, { method: "POST", headers, body });
const calls = [];
let existing = false;
let stored = 0;
const google = async (url, options = {}) => {
  calls.push({ url, method: options.method || "GET", headers: options.headers, body: options.body });
  assert.equal(options.headers.Authorization, "Bearer test-access");
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?q=")) {
    const q = new URL(url).searchParams.get("q");
    if (/hpdMediaId/.test(q)) return Response.json({ files: existing ? [{ id: "already_saved_01" }] : [] });
    if (/hpd-video-root/.test(q)) return Response.json({ files: [{ id: "video_root_0001" }] });
    assert.match(q, /'video_root_0001' in parents and name = 'ER04964'/);
    return Response.json({ files: [] });
  }
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?fields=id")) {
    const meta = JSON.parse(options.body);
    assert.deepEqual(meta.parents, ["video_root_0001"]);
    assert.equal(meta.appProperties.hpdKind, "hpd-video-job");
    return Response.json({ id: "job_folder_0001" });
  }
  if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id")) {
    const meta = JSON.parse(options.body);
    assert.deepEqual(meta.parents, ["job_folder_0001"]);
    assert.equal(meta.appProperties.hpdMediaId, "ER04964-before-2026-10-06T14:00:00.000Z-ab12cd");
    assert.equal(options.headers["X-Upload-Content-Length"], String(3 * VIDEO_PIECE + 10));
    return new Response(null, { status: 200, headers: { Location: SESSION } });
  }
  if (url === SESSION) {
    const range = options.headers["Content-Range"];
    if (range.startsWith("bytes */")) return new Response(null, { status: 308, headers: stored ? { Range: `bytes=0-${stored - 1}` } : {} });
    const [, from, to, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(range).map(Number);
    assert.equal(from, stored);
    assert.equal(options.body.byteLength, to - from + 1);
    stored = to + 1;
    return stored === total ? Response.json({ id: "video_file_01" }) : new Response(null, { status: 308, headers: { Range: `bytes=0-${stored - 1}` } });
  }
  throw new Error(`Unexpected request ${url}`);
};
const start = (body) => handleDriveVideos(req("video-start", JSON.stringify(body), { "Content-Type": "application/json" }), "video-start", auth, google);
const piece = (start, total, bytes, session = SESSION) => handleDriveVideos(req("video-piece", bytes, {
  "X-HPD-Session": encodeURIComponent(session), "X-HPD-Start": String(start), "X-HPD-Total": String(total),
}), "video-piece", auth, google);
const video = { mediaId: "ER04964-before-2026-10-06T14:00:00.000Z-ab12cd", jobId: "ER04964", name: "before.mp4", mimeType: "video/mp4", size: 3 * VIDEO_PIECE + 10 };

// Start: files the video under HPD Video Backup / <job> and hands back the upload session.
let response = await start(video);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { session: SESSION });

// Pieces: two pieces, an interruption (ask where it got to), then the rest.
const total = video.size;
response = await piece(0, total, new Uint8Array(2 * VIDEO_PIECE));
assert.deepEqual(await response.json(), { saved: 2 * VIDEO_PIECE });
response = await piece(0, total, new Uint8Array(0));
assert.deepEqual(await response.json(), { saved: 2 * VIDEO_PIECE });
response = await piece(2 * VIDEO_PIECE, total, new Uint8Array(VIDEO_PIECE + 10));
assert.deepEqual(await response.json(), { done: true, id: "video_file_01" });

// Already in Drive: never uploaded twice.
existing = true;
const before = calls.length;
response = await start(video);
assert.deepEqual(await response.json(), { done: true, id: "already_saved_01" });
assert.ok(!calls.slice(before).some((c) => c.url.includes("uploadType=resumable")));

// Refused: an address that is not a Google upload session, a middle piece off Google's 256 KB
// step, a range past the end, a video that is not a video id, an oversized piece.
for (const bad of ["https://evil.example.test/upload?upload_id=x", "https://www.googleapis.com/drive/v3/files?upload_id=x"]) {
  response = await piece(0, total, new Uint8Array(VIDEO_PIECE), bad);
  assert.equal(response.status, 400);
}
response = await piece(0, total, new Uint8Array(1000));
assert.equal(response.status, 400);
response = await piece(total - 5, total, new Uint8Array(10));
assert.equal(response.status, 400);
response = await start({ ...video, mediaId: "../x y" });
assert.equal(response.status, 400);
response = await start({ ...video, size: 500 * 1024 * 1024 });
assert.equal(response.status, 400);
response = await piece(0, 20 * 1024 * 1024, new Uint8Array(9 * 1024 * 1024));
assert.equal(response.status, 413);

// An expired upload session tells the phone to start over.
const expired = async () => new Response(null, { status: 404 });
response = await handleDriveVideos(req("video-piece", new Uint8Array(0), { "X-HPD-Session": encodeURIComponent(SESSION), "X-HPD-Start": "0", "X-HPD-Total": "10" }), "video-piece", auth, expired);
assert.equal(response.status, 410);
assert.deepEqual(await response.json(), { expired: true });

// Into the job's folder: the original moves from the backup folder into the package folder's
// "Original videos"; only this app's video files and package folders.
const moves = [];
const drive = async (url, options = {}) => {
  moves.push({ url, method: options.method || "GET" });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/video_file_01?fields=")) return Response.json({ id: "video_file_01", parents: ["job_folder_0001"], ownedByMe: true, trashed: false, appProperties: { hpdKind: "hpd-video-file" } });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/other_file_001?fields=")) return Response.json({ id: "other_file_001", parents: ["x"], ownedByMe: true, trashed: false, appProperties: { hpdKind: "hpd-package-file" } });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/package_folder_01?fields=")) return Response.json({ id: "package_folder_01", mimeType: "application/vnd.google-apps.folder", ownedByMe: true, trashed: false, appProperties: { hpdKind: "hpd-package-folder" } });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/someone_folder?fields=")) return Response.json({ id: "someone_folder", mimeType: "application/vnd.google-apps.folder", ownedByMe: false, trashed: false, appProperties: { hpdKind: "hpd-package-folder" } });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?q=")) {
    const q = new URL(url).searchParams.get("q");
    assert.match(q, /'package_folder_01' in parents and name = 'Original videos'/);
    return Response.json({ files: [] });
  }
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?fields=id")) return Response.json({ id: "originals_folder1" });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/video_file_01?")) {
    assert.equal(options.method, "PATCH");
    const params = new URL(url).searchParams;
    assert.equal(params.get("addParents"), "originals_folder1");
    assert.equal(params.get("removeParents"), "job_folder_0001");
    return Response.json({ id: "video_file_01", parents: ["originals_folder1"] });
  }
  throw new Error(`Unexpected request ${url}`);
};
const move = (body) => handleDriveVideos(req("video-to-package", JSON.stringify(body), { "Content-Type": "application/json" }), "video-to-package", auth, drive);
response = await move({ fileId: "video_file_01", folderId: "package_folder_01" });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { moved: true, folderId: "originals_folder1" });
assert.ok(moves.some((m) => m.method === "PATCH"));
response = await move({ fileId: "other_file_001", folderId: "package_folder_01" });
assert.equal(response.status, 403);
response = await move({ fileId: "video_file_01", folderId: "someone_folder" });
assert.equal(response.status, 403);
response = await move({ fileId: "../x", folderId: "package_folder_01" });
assert.equal(response.status, 400);

// Photos: same one-file upload, filed under "HPD Photo Backup / <job>".
const photoCalls = [];
const photoDrive = async (url, options = {}) => {
  photoCalls.push(url);
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?q=")) {
    const q = new URL(url).searchParams.get("q");
    if (/hpd-photo-root/.test(q)) return Response.json({ files: [{ id: "photo_root_0001" }] });
    if (/hpdMediaId/.test(q)) return Response.json({ files: [] });
    assert.match(q, /'photo_root_0001' in parents and name = 'ER04964'/);
    return Response.json({ files: [{ id: "photo_job_00001" }] });
  }
  if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id")) {
    assert.equal(options.headers["X-Upload-Content-Type"], "image/jpeg");
    assert.deepEqual(JSON.parse(options.body).parents, ["photo_job_00001"]);
    return new Response(null, { status: 200, headers: { Location: SESSION } });
  }
  throw new Error(`Unexpected request ${url}`);
};
response = await handleDriveVideos(req("video-start", JSON.stringify({ ...video, mediaId: "ER04964-before-photo-1", name: "before.jpg", mimeType: "image/jpeg", size: 300000 }), { "Content-Type": "application/json" }), "video-start", auth, photoDrive);
assert.deepEqual(await response.json(), { session: SESSION });
assert.ok(!photoCalls.some((u) => /hpd-video-root/.test(decodeURIComponent(u))), "photos never go in the video folder");

console.log("drive video backup: PASS");
