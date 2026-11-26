// 👷 Worker -> job card (owner, 25 Nov: "the workers should be able to take before and after pictures, send it back to the
// job card like I would do it from the app" + "send the jobs back to the job card as a package so I can email them when I
// generate the AFFIDAVIT"). The worker has no Google sign-in, so:
//   - the owner's app asks for a short pass for one job (worker-ticket, signed in): "<expiry>.<signature>", ~30 characters,
//     added to the worker link. The owner's Google access stays on the server, encrypted (KV "worker-owner").
//   - the worker page sends each Before / After photo or video with that pass (worker-start + worker-piece, no sign-in):
//     it can only add files to that job's folder in the owner's Drive (HPD Worker Uploads / <job>), nothing else.
//   - the owner's job card lists and pulls them in (worker-list, worker-file, worker-done, signed in), labeled Before / After.
import { handleDriveVideos } from "./drive-videos.mjs";

export const WORKER_OWNER_ACTIONS = ["worker-ticket", "worker-list", "worker-file", "worker-done", "worker-chat-boss"];
export const WORKER_PUBLIC_ACTIONS = ["worker-start", "worker-piece", "worker-chat"];

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_KIND = "hpd-worker-root";
const JOB_KIND = "hpd-worker-job";
const FILE_KIND = "hpd-worker-file";
const CHAT_KIND = "hpd-worker-chat";
const MAX_BYTES = 200 * 1024 * 1024;
const PASS_DAYS = 45;
const SESSION_URL = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?[^\s#]*upload_id=[\w-]+[^\s#]*$/;
const JOB_ID = /^[A-Z]{2}\d{5,6}$/;
const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
const reply = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function fail(message, status = 503) { const e = new Error(message); e.status = status; throw e; }
const quote = (v) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (v) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function signature(env, job, until) {
  const k = await crypto.subtle.importKey("raw", unb64(env.HPD_DRIVE_ENCRYPTION_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`worker-pass|${job}|${until}`)));
  return b64url(sig.slice(0, 16));
}
// "<days since 2026-01-01 when it ends>.<signature>": short enough for a WhatsApp link.
const EPOCH = Date.UTC(2026, 0, 1);
export async function makePass(env, job, now = Date.now()) {
  const until = Math.ceil((now - EPOCH) / 86400000) + PASS_DAYS;
  return `${until.toString(36)}.${await signature(env, job, until)}`;
}
export async function checkPass(env, job, pass, now = Date.now()) {
  const m = /^([0-9a-z]{1,6})\.([A-Za-z0-9_-]{22})$/.exec(String(pass || ""));
  if (!m || !JOB_ID.test(job)) return false;
  const until = parseInt(m[1], 36);
  if (!(EPOCH + until * 86400000 > now)) return false;
  const want = await signature(env, job, until);
  let diff = want.length ^ m[2].length;
  for (let i = 0; i < want.length && i < m[2].length; i++) diff |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0;
}

function driveCalls(authHeaders, fetcher) {
  const call = (url, options = {}) => fetcher(url, { ...options, headers: { ...authHeaders, ...options.headers }, signal: AbortSignal.timeout(90000) });
  const findOne = async (q) => {
    const r = await call(`${DRIVE}/files?${new URLSearchParams({ q: `trashed = false and 'me' in owners and ${q}`, fields: "files(id)", pageSize: "1" })}`);
    if (!r.ok) fail(`Could not read Google Drive (HTTP ${r.status}).`);
    return (await r.json()).files?.[0]?.id || "";
  };
  const folder = async (name, kind, parent, create = true) => {
    const found = await findOne(`mimeType = '${FOLDER_MIME}' and appProperties has { key='hpdKind' and value='${kind}' }${parent ? ` and '${parent}' in parents and name = '${quote(name)}'` : ""}`);
    if (found || !create) return found;
    const r = await call(`${DRIVE}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}), appProperties: { hpdKind: kind } }) });
    if (!r.ok) fail(`Could not create the Drive folder (HTTP ${r.status}).`);
    const { id } = await r.json();
    if (!validId(id)) fail("Drive did not return the folder.");
    return id;
  };
  const jobFolder = async (job, create = true) => {
    const root = await folder("HPD Worker Uploads", ROOT_KIND, "", create);
    return root ? folder(job, JOB_KIND, root, create) : "";
  };
  return { call, findOne, jobFolder };
}

// 💬 Chat between the boss and the worker, per job (owner, 26 Nov: "instead of WhatsApp can we communicate ... a chat or
// an app"): one small file in the job's folder (HPD Worker Uploads / <job> / chat.json), last 200 messages.
const cleanText = (v) => String(v || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000);
async function chat({ call, findOne, jobFolder }, job, add) {
  const dir = await jobFolder(job, Boolean(add));
  if (!dir) return [];
  const id = await findOne(`'${dir}' in parents and appProperties has { key='hpdKind' and value='${CHAT_KIND}' }`);
  let messages = [];
  if (id) {
    const r = await call(`${DRIVE}/files/${id}?alt=media`);
    if (!r.ok) fail(`Could not read the chat (HTTP ${r.status}).`);
    try { const d = JSON.parse(await r.text()); messages = Array.isArray(d.messages) ? d.messages : []; } catch { messages = []; }
  }
  if (!add) return messages;
  messages = [...messages, add].slice(-200);
  let fileId = id;
  if (!fileId) {
    const c = await call(`${DRIVE}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "chat.json", mimeType: "application/json", parents: [dir], appProperties: { hpdKind: CHAT_KIND, hpdJob: job } }) });
    if (!c.ok) fail(`Could not start the chat (HTTP ${c.status}).`);
    fileId = (await c.json()).id;
    if (!validId(fileId)) fail("Drive did not return the chat.");
  }
  const w = await call(`${UPLOAD}/${fileId}?uploadType=media&fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
  if (!w.ok) fail(`Could not send it (HTTP ${w.status}).`);
  return messages;
}

// Signed-in owner (called from handleDriveAuth after its Google identity checks).
export async function handleWorkerOwner(request, action, authHeaders, fetcher, env, keepOwner) {
  const drive = driveCalls(authHeaders, fetcher);
  const { call, jobFolder } = drive;
  try {
    let body = {};
    try { body = JSON.parse(await request.text() || "{}"); } catch { fail("Invalid request.", 400); }
    const job = String(body.jobId || "").toUpperCase();
    if (action === "worker-chat-boss") {
      if (!JOB_ID.test(job)) fail("Invalid job.", 400);
      const text = cleanText(body.text);
      return reply({ messages: await chat(drive, job, text ? { at: new Date().toISOString(), from: "boss", text } : null) });
    }
    if (action === "worker-ticket") {
      if (!JOB_ID.test(job)) fail("Invalid job.", 400);
      await keepOwner();
      return reply({ pass: await makePass(env, job) });
    }
    if (action === "worker-list") {
      if (!JOB_ID.test(job)) fail("Invalid job.", 400);
      const dir = await jobFolder(job, false);
      if (!dir) return reply({ files: [] });
      const q = `trashed = false and '${dir}' in parents and appProperties has { key='hpdKind' and value='${FILE_KIND}' }`;
      const r = await call(`${DRIVE}/files?${new URLSearchParams({ q, fields: "files(id,name,mimeType,size,createdTime,appProperties)", pageSize: "200", orderBy: "createdTime" })}`);
      if (!r.ok) fail(`Could not read Google Drive (HTTP ${r.status}).`);
      const files = ((await r.json()).files || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: Number(f.size || 0), at: f.createdTime,
        side: f.appProperties?.hpdSide === "after" ? "after" : "before", done: f.appProperties?.hpdOnCard === "1", taken: f.appProperties?.hpdTaken || f.createdTime, where: f.appProperties?.hpdWhere || "" }));
      return reply({ files });
    }
    if (action === "worker-file" || action === "worker-done") {
      const ids = (action === "worker-file" ? [body.fileId] : Array.isArray(body.fileIds) ? body.fileIds : []).map(String).slice(0, 200);
      if (!ids.length || !ids.every(validId)) fail("Invalid file.", 400);
      for (const id of ids) {
        const meta = await call(`${DRIVE}/files/${id}?fields=id,mimeType,ownedByMe,trashed,appProperties`);
        if (!meta.ok) fail(`Could not read Google Drive (HTTP ${meta.status}).`, meta.status === 404 ? 404 : 503);
        const m = await meta.json();
        if (!m.ownedByMe || m.trashed || m.appProperties?.hpdKind !== FILE_KIND) fail("Not a worker upload.", 403);
        if (action === "worker-file") {
          const r = await call(`${DRIVE}/files/${id}?alt=media`);
          if (!r.ok) fail(`Could not download it (HTTP ${r.status}).`);
          return new Response(r.body, { headers: { "Content-Type": m.mimeType || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        }
        const p = await call(`${DRIVE}/files/${id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appProperties: { hpdOnCard: "1" } }) });
        if (!p.ok) fail(`Could not mark it (HTTP ${p.status}).`);
      }
      return reply({ ok: true });
    }
    fail("Not found.", 404);
  } catch (e) {
    return reply({ error: e.status ? e.message : "Worker files could not be read right now." }, e.status || 503);
  }
}

export async function announceWorkerNew(env, fetcher, job, now = new Date()) {
  if (!JOB_ID.test(job)) return false;
  const worker = String(env?.HPD_STATUS_WORKER_URL || "https://hpd-status-worker.uac525.workers.dev").replace(/\/$/, "");
  try {
    const r = await fetcher(`${worker}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: job, patch: { WorkerNewAt: now.toISOString() } }) });
    return r.ok;
  } catch { return false; }
}

// The worker's phone (no sign-in): only with a valid pass for that job. getAccess() renews the owner's Google access
// from the saved, encrypted sign-in.
export async function handleWorkerPublic(request, action, env, fetcher, getAccess) {
  try {
    const job = String(request.headers.get("X-HPD-Job") || "").toUpperCase();
    if (!(await checkPass(env, job, request.headers.get("X-HPD-Pass")))) fail("This link has no upload pass or it ended: ask your boss to send the job again.", 403);
    if (action === "worker-piece") return handleDriveVideos(request, "video-piece", {}, fetcher);
    if (action === "worker-chat") {
      let b = {};
      try { b = JSON.parse(await request.text() || "{}"); } catch { fail("Invalid request.", 400); }
      const access = await getAccess();
      if (!access) fail("Your boss's Google sign-in needs renewing: ask your boss to open the app.", 503);
      const text = cleanText(b.text);
      return reply({ messages: await chat(driveCalls({ Authorization: `Bearer ${access}` }, fetcher), job, text ? { at: new Date().toISOString(), from: "worker", text } : null) });
    }
    if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail("JSON request required.", 415);
    let body;
    try { body = JSON.parse(await request.text()); } catch { fail("Invalid request.", 400); }
    const mediaId = String(body.mediaId || "");
    const size = Number(body.size);
    const side = body.side === "after" ? "after" : "before";
    if (!/^[\w:.+-]{1,100}$/.test(mediaId)) fail("Invalid file id.", 400);
    if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) fail("This file is too big (200 MB at most): record a shorter video.", 400);
    const mime = /^(image|video)\/[\w.+-]+$/.test(body.mimeType || "") ? body.mimeType : "";
    if (!mime) fail("Only photos and videos.", 400);
    const access = await getAccess();
    if (!access) fail("Your boss's Google sign-in needs renewing: ask your boss to open the app.", 503);
    const { call, findOne, jobFolder } = driveCalls({ Authorization: `Bearer ${access}` }, fetcher);
    const dir = await jobFolder(job);
    const existing = await findOne(`'${dir}' in parents and appProperties has { key='hpdMediaId' and value='${quote(mediaId)}' }`);
    if (existing) return reply({ done: true, id: existing });
    const ext = mime.startsWith("video/") ? (mime.includes("quicktime") ? "mov" : "mp4") : (mime.includes("png") ? "png" : mime.includes("heic") ? "heic" : "jpg");
    // Numbering counts what is already in the job's folder (owner, 25 Nov: "is photo numbering good"): a fresh opening of
    // the worker link no longer starts again at 1, so there are never two "BEFORE photo 1" files.
    // 📍 Where it was taken (Kitchen, Bathroom…): in the name and numbered per spot.
    const spotRaw = String(body.where || "").replace(/[^\p{L}\p{N} #'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30);
    const spot = spotRaw ? spotRaw[0].toUpperCase() + spotRaw.slice(1) : "";
    const label = `${job} ${side === "after" ? "AFTER" : "BEFORE"} ${spot ? `${spot} ` : ""}${mime.startsWith("video/") ? "video" : "photo"} `;
    let n = Math.max(1, Math.min(999, Number(body.n) || 1));
    const have = await call(`${DRIVE}/files?${new URLSearchParams({ q: `trashed = false and '${dir}' in parents and appProperties has { key='hpdKind' and value='${FILE_KIND}' }`, fields: "files(name)", pageSize: "1000" })}`);
    if (have.ok) {
      let top = 0;
      for (const f of (await have.json()).files || []) {
        const name = String(f.name || "");
        if (name.startsWith(label)) top = Math.max(top, parseInt(name.slice(label.length), 10) || 0);
      }
      n = Math.min(999, top + 1);
    }
    // The day it was taken in the name (owner, 25 Nov: "the date you can save in the file name itself").
    const taken = Number.isFinite(Date.parse(body.takenAt)) ? new Date(body.takenAt) : new Date();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(taken);
    // 25 Nov: "labeled" = the worker's phone already printed OMO / location / address / date on the photo (not printed twice).
    const labeled = body.labeled === true && !mime.startsWith("video/") ? " labeled" : "";
    const name = `${label}${n} ${day}${labeled}.${ext}`;
    const start = await call(`${UPLOAD}?uploadType=resumable&fields=id`, { method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(size) },
      body: JSON.stringify({ name, parents: [dir], appProperties: { hpdKind: FILE_KIND, hpdMediaId: mediaId, hpdSide: side, hpdJob: job, hpdTaken: taken.toISOString(), ...(spot ? { hpdWhere: spot } : {}) } }) });
    const session = start.headers.get("Location") || "";
    if (!start.ok || !SESSION_URL.test(session)) fail(`The upload could not start (HTTP ${start.status}).`);
    // 📸 New worker photos (plan item 43): the first photo of the worker's visit stamps the job's shared entry, so the
    // boss's map and Home card show "new from worker". Job number and time only; once per visit (status server limits).
    if (body.announce === true) await announceWorkerNew(env, fetcher, job);
    return reply({ session });
  } catch (e) {
    return reply({ error: e.status ? e.message : "The upload could not start. Try again." }, e.status || 503);
  }
}
