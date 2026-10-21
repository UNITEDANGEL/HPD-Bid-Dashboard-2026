// Approved paperwork packages: a Drive folder per package (PDF, photos, videos, manifest)
// and an email of the PDF and photos sent from the owner's own Gmail.
// Only reachable through handleDriveAuth, after the owner/session/Google identity checks.

import { aiDraft, draftFacts } from "./ai-draft.mjs";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const GMAIL_SEND = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media";
const ROOT_KIND = "hpd-packages-root";
const FOLDER_KIND = "hpd-package-folder";
// Year / month / borough folders that keep the packages filed neatly.
const GROUP_KIND = "hpd-package-group";
const FILE_KIND = "hpd-package-file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_FILE_BYTES = 90 * 1024 * 1024;
const MAX_EMAIL_BYTES = 30 * 1024 * 1024;
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
// Bids go to HPD's bid fax, (212) 863-8655 (printed on every invitation), through HumbleFax's
// email-to-fax: the PDF is faxed, the email's subject and body become the cover sheet.
const DEFAULT_BID_FAX = "2128638655@humblefax.com";
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

// Turn Gmail's refusal into the one fix the owner needs to make.
export async function gmailRefusal(response) {
  let reasons = "";
  try {
    const body = await response.json();
    const error = body.error || {};
    reasons = [error.status, error.message, ...(error.errors || []).map((item) => item.reason), ...(error.details || []).map((item) => item.reason)]
      .filter(Boolean).join(" ");
  } catch {}
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reasons)) {
    return "Gmail API is turned off in your Google Cloud project. Enable Gmail API (APIs & Services > Library), then tap Send email again.";
  }
  if (/insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT|PERMISSION_DENIED|scope/i.test(reasons) || response.status === 403) {
    return "Your Google connection does not include sending email. On the Storage page tap Disconnect, then Connect, and tick \"Send email on your behalf\" on Google's screen.";
  }
  if (response.status === 401) return "Google sign-in expired. Reconnect Google on the Storage page, then tap Send email again.";
  return `Gmail could not send the package (HTTP ${response.status}${reasons ? `: ${reasons.slice(0, 160)}` : ""}).`;
}

// HPD's backup bid fax lines (printed on every invitation), used when (212) 863-8655 fails. The browser
// only picks which line; the address is always built here, through HumbleFax.
export const BACKUP_FAX_LINES = { "7804": "2128637804@humblefax.com", "7805": "2128637805@humblefax.com" };
export function bidFaxRecipient(env, line = "") {
  if (line && line !== "main") {
    const backup = BACKUP_FAX_LINES[line];
    if (!backup) fail("Unknown fax line.", 400);
    return backup;
  }
  const to = String(env.HPD_BID_FAX_TO || DEFAULT_BID_FAX).trim().toLowerCase();
  if (!/^\d{10}@humblefax\.com$/.test(to)) fail("Bid fax number is not set up correctly.", 500);
  return to;
}

// HumbleFax's reply about a faxed bid: confirmed, failed, or not here yet.
export function faxResult(subject, snippet) {
  const text = `${subject} ${snippet}`;
  if (/fail|unsuccessful|not (?:be )?(?:sent|delivered)|could not|error|busy|no answer|rejected/i.test(text)) return "failed";
  if (/success|delivered|was sent|has been sent|complete|confirm/i.test(text)) return "confirmed";
  return "";
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
  // Reuses an existing folder of this app with the same name under the same parent.
  const findOrCreateFolder = async (name, kind, parent) => {
    const quoted = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = new URLSearchParams({ q: `trashed = false and 'me' in owners and '${parent}' in parents and name = '${quoted}' and mimeType = '${FOLDER_MIME}' and appProperties has { key='hpdKind' and value='${kind}' }`, fields: "files(id)", pageSize: "1" });
    const found = await getJson(`${DRIVE}/files?${query}`, "Could not read Google Drive");
    const id = found.files?.[0]?.id || (await createFolder(name, kind, parent)).id;
    if (!validId(id)) fail("Drive did not return the folder.");
    return id;
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
      // Optional filing path, e.g. ["2026", "10 - October", "Manhattan"]: each level is one folder name.
      let parentId = rootId;
      const path = Array.isArray(body.path) ? body.path.slice(0, 4) : [];
      for (const level of path) parentId = await findOrCreateFolder(cleanName(level, "Other"), GROUP_KIND, parentId);
      const folder = await createFolder(cleanName(body.name, "HPD package"), FOLDER_KIND, parentId);
      if (!validId(folder.id)) fail("Drive did not return the package folder.");
      return reply({ folderId: folder.id, link: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}` });
    }

    if (action === "package-file") {
      const folderId = request.headers.get("X-HPD-Folder") || "";
      if (!validId(folderId)) fail("Invalid package folder.", 400);
      const folder = await getJson(`${DRIVE}/files/${folderId}?fields=id,mimeType,ownedByMe,trashed,appProperties`, "Could not read the package folder");
      if (!folder.ownedByMe || folder.trashed || folder.mimeType !== FOLDER_MIME || folder.appProperties?.hpdKind !== FOLDER_KIND) fail("Not an HPD package folder owned by this account.", 403);
      // Optional subfolder inside the package, e.g. "Before photos".
      let subfolder = "";
      try { subfolder = decodeURIComponent(request.headers.get("X-HPD-Subfolder") || "").trim(); } catch { fail("Invalid subfolder name.", 400); }
      const targetId = subfolder ? await findOrCreateFolder(cleanName(subfolder, "Files"), FOLDER_KIND, folderId) : folderId;
      let name;
      try { name = cleanName(decodeURIComponent(request.headers.get("X-HPD-Name") || ""), "file"); } catch { fail("Invalid file name.", 400); }
      const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(request.headers.get("Content-Type") || "") ? request.headers.get("Content-Type") : "application/octet-stream";
      const bytes = await bodyBytes(request, MAX_FILE_BYTES, "File");
      // Resumable upload works for any size (multipart is limited to 5 MB).
      const start = await call(`${UPLOAD}?uploadType=resumable&fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(bytes.byteLength) },
        body: JSON.stringify({ name, parents: [targetId], appProperties: { hpdKind: FILE_KIND } }),
      });
      const session = start.headers.get("Location");
      if (!start.ok || !session?.startsWith("https://www.googleapis.com/")) fail(`Drive upload could not start (HTTP ${start.status}).`);
      const upload = await call(session, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
      if (!upload.ok) fail(`Drive upload failed for ${name} (HTTP ${upload.status}).`);
      const file = await upload.json();
      return reply({ id: file.id, name });
    }

    if (action === "fax-bid") {
      // Same shape as email-package, but only ever to HPD's bid fax (set here, never by the browser).
      const boundary = request.headers.get("X-HPD-Boundary") || "";
      if (!/^[A-Za-z0-9_-]{16,70}$/.test(boundary)) fail("Invalid fax request.", 400);
      if (request.headers.get("Content-Type") !== "text/plain") fail("Invalid fax request.", 415);
      let subject;
      try { subject = decodeURIComponent(request.headers.get("X-HPD-Subject") || ""); } catch { fail("Invalid fax subject.", 400); }
      const parts = await bodyBytes(request, MAX_EMAIL_BYTES, "Bid fax");
      const to = bidFaxRecipient(env, request.headers.get("X-HPD-Fax-Line") || "");
      const head = new TextEncoder().encode([
        `From: ${ownerEmail}`, `To: ${to}`, `Subject: ${encodeHeader(subject || "HPD bid")}`, "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`, "", "",
      ].join("\r\n"));
      const message = new Uint8Array(head.byteLength + parts.byteLength);
      message.set(head, 0);
      message.set(parts, head.byteLength);
      const sent = await call(GMAIL_SEND, { method: "POST", headers: { "Content-Type": "message/rfc822" }, body: message });
      if (!sent.ok) fail(await gmailRefusal(sent), sent.status === 401 || sent.status === 403 ? 403 : 503);
      let receipt = {};
      try { receipt = await sent.json(); } catch {}
      return reply({ sent: true, to, messageId: typeof receipt.id === "string" ? receipt.id : "", sentAt: new Date().toISOString() });
    }

    if (action === "fax-status") {
      // HumbleFax emails a confirmation after a fax goes through: look for its reply since the send.
      const body = await request.json().catch(() => null);
      const since = Date.parse(body?.sentAt || "");
      const omo = String(body?.omo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      if (!Number.isFinite(since)) fail("Invalid fax status request.", 400);
      const q = encodeURIComponent(`from:humblefax.com after:${Math.floor(since / 1000) - 120}`);
      const listed = await call(`${GMAIL_API}?q=${q}&maxResults=10`);
      if (listed.status === 403) fail("Checking the fax needs read access to email: on the Storage page tap Disconnect, then Connect, and allow reading email.", 403);
      if (!listed.ok) fail(`Couldn't check the fax (HTTP ${listed.status}).`);
      const ids = ((await listed.json()).messages || []).map((m) => m.id).filter(Boolean);
      const replies = [];
      for (const id of ids) {
        const got = await call(`${GMAIL_API}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`);
        if (!got.ok) continue;
        const m = await got.json();
        const header = (name) => (m.payload?.headers || []).find((h) => String(h.name).toLowerCase() === name)?.value || "";
        replies.push({ subject: header("subject"), snippet: String(m.snippet || ""), at: new Date(Number(m.internalDate) || Date.parse(header("date"))).toISOString() });
      }
      // The reply that names this OMO; otherwise the first reply after the send that names no other OMO
      // (with several bids out, one job's confirmation must not count for another).
      const names = (r) => (`${r.subject} ${r.snippet}`.toUpperCase().match(/\b[A-Z]{2}\d{5}\b/g) || []);
      const pick = replies.find((r) => omo && names(r).includes(omo))
        || replies.filter((r) => !names(r).some((o) => o !== omo)).sort((a, b) => a.at.localeCompare(b.at))[0];
      const status = pick ? faxResult(pick.subject, pick.snippet) || "confirmed" : "waiting";
      return reply({ status, subject: pick?.subject || "", at: pick?.at || "" });
    }

    if (action === "hpd-scan") {
      // "Check my emails now" (owner, 19 Oct): the owner's emails with HPD from the last N days (read-only): what you sent
      // (and whether PDFs were attached) and what HPD wrote back, by thread, so the board updates at once. Subjects and
      // dates only, never the message text.
      const body = await request.json().catch(() => ({}));
      const days = Math.min(30, Math.max(1, Number(body?.days) || 7));
      const list = async (q) => {
        const ids = [];
        let page = "";
        for (let i = 0; i < 4; i++) {
          const r = await call(`${GMAIL_API}?q=${encodeURIComponent(q)}&maxResults=100${page ? `&pageToken=${page}` : ""}`);
          if (r.status === 403) fail("Checking your email needs read access: on the Storage page tap Disconnect, then Connect, and allow reading email.", 403);
          if (!r.ok) fail(`Couldn't read your email (HTTP ${r.status}).`);
          const d = await r.json();
          for (const m of d.messages || []) ids.push(m.id);
          page = d.nextPageToken || "";
          if (!page) break;
        }
        return ids;
      };
      const [sentIds, withFiles, receivedIds] = await Promise.all([
        list(`in:sent to:hpd.nyc.gov newer_than:${days}d`),
        list(`in:sent to:hpd.nyc.gov has:attachment newer_than:${days}d`),
        list(`from:hpd.nyc.gov newer_than:${days}d`),
      ]);
      const files = new Set(withFiles);
      const meta = async (id) => {
        const r = await call(`${GMAIL_API}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`);
        if (!r.ok) return null;
        const m = await r.json();
        const subject = String((m.payload?.headers || []).find((h) => String(h.name).toLowerCase() === "subject")?.value || "").slice(0, 200);
        return { id, threadId: String(m.threadId || ""), at: new Date(Number(m.internalDate) || 0).toISOString(), subject, omos: [...new Set(subject.toUpperCase().match(/\b[A-Z]{2}\d{5}\b/g) || [])] };
      };
      const all = async (ids) => (await Promise.all(ids.slice(0, 150).map(meta))).filter(Boolean);
      const [sent, received] = await Promise.all([all(sentIds), all(receivedIds)]);
      return reply({ days, checkedAt: new Date().toISOString(), sent: sent.map((m) => ({ ...m, files: files.has(m.id) })), received });
    }

    // "See what you sent" (owner, 20 Oct: "I need a link to see and confirm the paperwork that was sent, not just the
    // dates"): the owner's sent emails naming a job that carry PDFs (read-only), newest first, and one PDF from one of
    // them. Only to the signed-in owner, like the rest of the private data.
    const pdfParts = (payload) => {
      const out = [];
      const walk = (p) => {
        if (!p) return;
        const name = String(p.filename || "");
        if ((p.mimeType === "application/pdf" || /\.pdf$/i.test(name)) && (p.body?.attachmentId || p.body?.data)) out.push({ name: name || "document.pdf", size: Number(p.body?.size) || 0, attachmentId: p.body?.attachmentId || "", data: p.body?.data || "" });
        for (const c of p.parts || []) walk(c);
      };
      walk(payload);
      return out;
    };
    if (action === "hpd-sent") {
      const body = await request.json().catch(() => null);
      const omo = String(body?.omo || "").toUpperCase();
      if (!/^[A-Z]{2}\d{5}$/.test(omo)) fail("Invalid job number.", 400);
      const listed = await call(`${GMAIL_API}?q=${encodeURIComponent(`in:sent ${omo} has:attachment`)}&maxResults=10`);
      if (listed.status === 403) fail("Seeing what you sent needs read access to email: on the Storage page tap Disconnect, then Connect, and allow reading email.", 403);
      if (!listed.ok) fail(`Couldn't read your email (HTTP ${listed.status}).`);
      const ids = ((await listed.json()).messages || []).map((m) => m.id).filter(validId);
      const emails = [];
      for (const id of ids) {
        const got = await call(`${GMAIL_API}/${encodeURIComponent(id)}?format=full`);
        if (!got.ok) continue;
        const m = await got.json();
        const header = (name) => String((m.payload?.headers || []).find((h) => String(h.name).toLowerCase() === name)?.value || "");
        const files = pdfParts(m.payload).map((f, i) => ({ i, name: f.name.slice(0, 120), size: f.size }));
        if (!files.length) continue;
        emails.push({ id, threadId: String(m.threadId || ""), at: new Date(Number(m.internalDate) || Date.parse(header("date")) || 0).toISOString(), to: header("to").slice(0, 200), subject: header("subject").slice(0, 200), files });
      }
      emails.sort((a, b) => b.at.localeCompare(a.at));
      return reply({ omo, emails });
    }
    if (action === "hpd-sent-pdf") {
      const body = await request.json().catch(() => null);
      const id = String(body?.id || "");
      const i = Number(body?.i);
      if (!validId(id) || !Number.isInteger(i) || i < 0 || i > 50) fail("Invalid file request.", 400);
      const got = await call(`${GMAIL_API}/${encodeURIComponent(id)}?format=full`);
      if (got.status === 403) fail("Seeing what you sent needs read access to email.", 403);
      if (!got.ok) fail(`Couldn't read that email (HTTP ${got.status}).`);
      const part = pdfParts((await got.json()).payload)[i];
      if (!part) fail("That PDF is not in the email.", 404);
      let data = part.data;
      if (!data) {
        const a = await call(`${GMAIL_API}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(part.attachmentId)}`);
        if (!a.ok) fail(`Couldn't open the PDF (HTTP ${a.status}).`);
        data = String((await a.json()).data || "");
      }
      const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      return new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="${part.name.replace(/[^A-Za-z0-9 ._()-]/g, "_")}"` } });
    }

    if (action === "hpd-draft") {
      // An AI-written reply for the 24 / 72-hour board, for the owner to read and edit. Never sends anything.
      const facts = draftFacts(await request.json().catch(() => null));
      if (!facts) fail("Invalid draft request.", 400);
      try {
        return reply(await aiDraft(env, facts, fetcher));
      } catch (e) {
        return reply({ ai: false, reason: `The AI didn’t answer (${e instanceof Error ? e.message.slice(0, 120) : "error"}).` });
      }
    }

    if (action === "hpd-reply") {
      // A short note to the HPD person who sent a notice (e.g. "the rejection is fixed, a copy is attached, the
      // original is in the mail"), with at most one PDF (the copy of the fixed paperwork). Only ever to one
      // @hpd.nyc.gov address, from the owner's account, sent when the owner taps Send.
      if (!/^application\/json/.test(request.headers.get("Content-Type") || "")) fail("Invalid reply.", 415);
      let body;
      try { body = JSON.parse(new TextDecoder().decode(await bodyBytes(request, 14 * 1024 * 1024, "Reply"))); } catch (e) { if (e?.status) throw e; fail("Invalid reply.", 400); }
      // "Send to me first": the same email to the owner's own address, to check it (or forward it) from Gmail.
      const toSelf = body?.toSelf === true;
      const to = toSelf ? String(ownerEmail).toLowerCase() : String(body?.to || "").trim().toLowerCase();
      const subject = `${toSelf ? "[CHECK BEFORE SENDING] " : ""}${String(body?.subject || "").trim()}`;
      const text = String(body?.text || "").trim();
      if (!toSelf && !/^[a-z0-9._%+-]+@hpd\.nyc\.gov$/.test(to)) fail("Replies only go to an @hpd.nyc.gov address.", 400);
      if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) fail("Invalid subject.", 400);
      if (!text || text.length > 4000) fail("Invalid message.", 400);
      const att = body?.attachment;
      let pdf = null;
      if (att) {
        const name = String(att.name || "");
        const data = String(att.data || "");
        if (!/^[A-Za-z0-9 _.,()-]{1,100}\.pdf$/.test(name)) fail("Invalid attachment name.", 400);
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length > 13 * 1024 * 1024) fail("Invalid attachment.", 400);
        if (!data.startsWith("JVBER")) fail("Only a PDF can be attached.", 400); // "%PDF"
        pdf = { name, data };
      }
      const b64text = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t.replace(/\r?\n/g, "\r\n")))).replace(/.{76}/g, "$&\r\n");
      const boundary = `hpdreply${crypto.randomUUID().replace(/-/g, "")}`;
      const lines = [`From: ${ownerEmail}`, `To: ${to}`, `Subject: ${encodeHeader(subject)}`, "MIME-Version: 1.0"];
      if (!pdf) lines.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64text(text));
      else lines.push(
        `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
        `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64text(text),
        `--${boundary}`, `Content-Type: application/pdf; name="${pdf.name}"`, `Content-Disposition: attachment; filename="${pdf.name}"`, "Content-Transfer-Encoding: base64", "", pdf.data.replace(/.{76}/g, "$&\r\n"),
        `--${boundary}--`, "");
      const sent = await call(GMAIL_SEND, { method: "POST", headers: { "Content-Type": "message/rfc822" }, body: new TextEncoder().encode(lines.join("\r\n")) });
      if (!sent.ok) fail(await gmailRefusal(sent), sent.status === 401 || sent.status === 403 ? 403 : 503);
      let receipt = {};
      try { receipt = await sent.json(); } catch {}
      return reply({ sent: true, to, messageId: typeof receipt.id === "string" ? receipt.id : "", attached: pdf ? pdf.name : "" });
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
      if (!sent.ok) fail(await gmailRefusal(sent), sent.status === 401 || sent.status === 403 ? 403 : 503);
      // Gmail's receipt: the message id, and its labels (INBOX when it was delivered to this mailbox).
      let receipt = {};
      try { receipt = await sent.json(); } catch {}
      const labels = Array.isArray(receipt.labelIds) ? receipt.labelIds.map(String) : [];
      return reply({ sent: true, to, messageId: typeof receipt.id === "string" ? receipt.id : "", labels });
    }

    fail("Not found.", 404);
  } catch (e) {
    // In the server log (Cloudflare): which step failed and why (messages are ours: no tokens, no file contents).
    console.error(`drive ${action} failed: ${e.status || 503} ${e.status ? e.message : `${e?.name}: ${String(e?.message || "").slice(0, 120)}`}`);
    return reply({ error: e.status ? e.message : "Package delivery failed. The package is still on this device." }, e.status || 503);
  }
}

// Phone alerts (owner, 20 Oct: "ring for all notifications"; 21 Oct: "this has to be automatic, I shouldn't have to
// turn it on"): this phone's push address, encrypted with the private-data key, kept on the status server as PUSH-<id>.
// The 10-minute fetcher decrypts the addresses and sends the alerts (scripts/send-push.mjs). No Google sign-in needed
// (the Home Screen app has its own sign-in): a phone that isn't signed in gets short alerts (kind, job, who) without
// the email subject.
export async function handlePushSubscribe(request, env, fetcher = fetch, signedIn = false) {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => null);
  const sub = body?.subscription;
  const endpoint = String(sub?.endpoint || "");
  let host = "";
  try { host = new URL(endpoint).hostname; } catch { return reply({ error: "Invalid phone address." }, 400); }
  if (!/^https:\/\//.test(endpoint) || !/(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(host)) return reply({ error: "Not a phone alert address." }, 400);
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(String(sub?.keys?.p256dh || "")) || !/^[A-Za-z0-9_-]{10,100}$/.test(String(sub?.keys?.auth || ""))) return reply({ error: "Invalid phone alert keys." }, 400);
  const keyText = String(env?.HPD_PRIVATE_DATA_KEY || "").trim();
  const raw = keyText ? Uint8Array.from(atob(keyText), (c) => c.charCodeAt(0)) : new Uint8Array();
  if (raw.length !== 32) return reply({ error: "Phone alerts need the private-data key on the server." }, 503);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(12 + sealed.length); out.set(iv); out.set(sealed, 12);
  let bin = ""; for (const b of out) bin += String.fromCharCode(b);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  const id = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const device = String(body?.device || "").replace(/[^A-Za-z0-9 ._()-]/g, "").slice(0, 40) || "phone";
  const worker = String(env?.HPD_STATUS_WORKER_URL || "https://hpd-status-worker.uac525.workers.dev").replace(/\/$/, "");
  const saved = await fetcher(`${worker}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `PUSH-${id}`, patch: { enc: btoa(bin), device, signedIn: !!signedIn, at: new Date().toISOString(), off: body?.off === true } }) });
  if (!saved.ok) return reply({ error: `Couldn't save the phone (HTTP ${saved.status}).` }, 503);
  return reply({ ok: true, id, off: body?.off === true, signedIn: !!signedIn });
}
