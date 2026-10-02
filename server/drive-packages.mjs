// Approved paperwork packages: a Drive folder per package (PDF, photos, videos, manifest)
// and an email of the PDF and photos sent from the owner's own Gmail.
// Only reachable through handleDriveAuth, after the owner/session/Google identity checks.

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const GMAIL_SEND = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media";
const ROOT_KIND = "hpd-packages-root";
const FOLDER_KIND = "hpd-package-folder";
const FILE_KIND = "hpd-package-file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_FILE_BYTES = 90 * 1024 * 1024;
const MAX_EMAIL_BYTES = 30 * 1024 * 1024;
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
const reply = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function fail(message, status = 503) { const error = new Error(message); error.status = status; throw error; }

// Folder and file names only; never paths.
function cleanName(value, fallback) {
  const name = String(value || "").replace(/[\u0000-\u001f\\/]+/g, "-").trim().slice(0, 180);
  return name || fallback;
}

// RFC 2047 encoded-word so subjects with non-ASCII text survive.
function encodeHeader(value) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").slice(0, 300);
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`;
}

export function packageRecipients(env, ownerEmail) {
  const list = String(env.HPD_PACKAGE_EMAIL_TO || ownerEmail).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.length > 5 || !list.every((value) => EMAIL.test(value))) fail("Package email recipient is not set up correctly.", 500);
  return list;
}

async function bodyBytes(request, limit, label) {
  if (Number(request.headers.get("Content-Length")) > limit) fail(`${label} is too large.`, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) fail(`${label} is empty.`, 400);
  if (bytes.byteLength > limit) fail(`${label} is too large.`, 413);
  return bytes;
}

export async function handleDrivePackages(request, action, authHeaders, fetcher, env, ownerEmail) {
  const call = (url, options = {}) => fetcher(url, { ...options, headers: { ...authHeaders, ...options.headers }, signal: AbortSignal.timeout(60000) });
  const getJson = async (url, message) => {
    const response = await call(url);
    if (!response.ok) fail(`${message} (HTTP ${response.status}).`);
    return response.json();
  };
  const createFolder = async (name, kind, parent) => {
    const response = await call(`${DRIVE}/files?fields=id,webViewLink`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}), appProperties: { hpdKind: kind } }),
    });
    if (!response.ok) fail(`Could not create the Drive folder (HTTP ${response.status}).`);
    return response.json();
  };

  try {
    if (action === "package-folder") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail("JSON request required.", 415);
      let body;
      try { body = JSON.parse(new TextDecoder().decode(await bodyBytes(request, 4096, "Request"))); } catch (e) { if (e.status) throw e; fail("Invalid request.", 400); }
      const query = new URLSearchParams({ q: `trashed = false and 'me' in owners and mimeType = '${FOLDER_MIME}' and appProperties has { key='hpdKind' and value='${ROOT_KIND}' }`, fields: "files(id)", pageSize: "1" });
      const roots = await getJson(`${DRIVE}/files?${query}`, "Could not read Google Drive");
      const rootId = roots.files?.[0]?.id || (await createFolder("HPD Packages", ROOT_KIND)).id;
      if (!validId(rootId)) fail("Drive did not return the HPD Packages folder.");
      const folder = await createFolder(cleanName(body.name, "HPD package"), FOLDER_KIND, rootId);
      if (!validId(folder.id)) fail("Drive did not return the package folder.");
      return reply({ folderId: folder.id, link: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}` });
    }

    if (action === "package-file") {
      const folderId = request.headers.get("X-HPD-Folder") || "";
      if (!validId(folderId)) fail("Invalid package folder.", 400);
      const folder = await getJson(`${DRIVE}/files/${folderId}?fields=id,mimeType,ownedByMe,trashed,appProperties`, "Could not read the package folder");
      if (!folder.ownedByMe || folder.trashed || folder.mimeType !== FOLDER_MIME || folder.appProperties?.hpdKind !== FOLDER_KIND) fail("Not an HPD package folder owned by this account.", 403);
      let name;
      try { name = cleanName(decodeURIComponent(request.headers.get("X-HPD-Name") || ""), "file"); } catch { fail("Invalid file name.", 400); }
      const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(request.headers.get("Content-Type") || "") ? request.headers.get("Content-Type") : "application/octet-stream";
      const bytes = await bodyBytes(request, MAX_FILE_BYTES, "File");
      // Resumable upload works for any size (multipart is limited to 5 MB).
      const start = await call(`${UPLOAD}?uploadType=resumable&fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(bytes.byteLength) },
        body: JSON.stringify({ name, parents: [folderId], appProperties: { hpdKind: FILE_KIND } }),
      });
      const session = start.headers.get("Location");
      if (!start.ok || !session?.startsWith("https://www.googleapis.com/")) fail(`Drive upload could not start (HTTP ${start.status}).`);
      const upload = await call(session, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
      if (!upload.ok) fail(`Drive upload failed for ${name} (HTTP ${upload.status}).`);
      const file = await upload.json();
      return reply({ id: file.id, name });
    }

    if (action === "email-package") {
      // The browser builds the multipart body (attachments already base64); the server sets
      // From/To/Subject so this can only email the owner's configured recipients.
      const boundary = request.headers.get("X-HPD-Boundary") || "";
      if (!/^[A-Za-z0-9_-]{16,70}$/.test(boundary)) fail("Invalid email request.", 400);
      if (request.headers.get("Content-Type") !== "text/plain") fail("Invalid email request.", 415);
      let subject;
      try { subject = decodeURIComponent(request.headers.get("X-HPD-Subject") || ""); } catch { fail("Invalid email subject.", 400); }
      const parts = await bodyBytes(request, MAX_EMAIL_BYTES, "Email package");
      const to = packageRecipients(env, ownerEmail);
      const head = new TextEncoder().encode([
        `From: ${ownerEmail}`,
        `To: ${to.join(", ")}`,
        `Subject: ${encodeHeader(subject || "HPD package")}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        "",
      ].join("\r\n"));
      const message = new Uint8Array(head.byteLength + parts.byteLength);
      message.set(head, 0);
      message.set(parts, head.byteLength);
      const sent = await call(GMAIL_SEND, { method: "POST", headers: { "Content-Type": "message/rfc822" }, body: message });
      if (sent.status === 403 || sent.status === 401) fail("Gmail did not allow sending. Reconnect Google on the Storage page and allow sending email.", 403);
      if (!sent.ok) fail(`Gmail could not send the package (HTTP ${sent.status}).`);
      return reply({ sent: true, to });
    }

    fail("Not found.", 404);
  } catch (e) {
    return reply({ error: e.status ? e.message : "Package delivery failed. The package is still on this device." }, e.status || 503);
  }
}
