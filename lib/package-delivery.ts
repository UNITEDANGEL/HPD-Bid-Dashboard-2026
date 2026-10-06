// Sends an approved package to Google Drive and email through /api/drive (server/drive-packages.mjs).

// subfolder: optional folder inside the package folder on Drive, e.g. "Before photos".
export type DeliveryFile = { name: string; mimeType: string; bytes: Uint8Array; subfolder?: string };

export type GoogleStatus = { configured: boolean; connected: boolean; canEmail: boolean; email: string | null };

export type DeliveryResult = {
  folderLink: string;
  uploaded: number;
  emailed: boolean;
  emailTo: string[];
  emailError: string;
  attachedPhotos: boolean;
  // Drive link for each uploaded file, by file name (used for videos too big to attach).
  fileLinks: Record<string, string>;
  // What the email actually carried (shown on screen after sending).
  emailSummary?: EmailAttachmentSummary;
  // Gmail's receipt for the sent email: its message id, and whether it landed in this inbox.
  emailReceipt?: { messageId: string; inInbox: boolean };
};

// What the email carries: counts of attached photos/videos, and links for files left out.
export type EmailAttachmentSummary = { photos: number; videos: number; linked: { name: string; url: string }[] };

// Gmail allows 25 MB per message; base64 adds about a third.
export const EMAIL_ATTACHMENT_LIMIT = 17 * 1024 * 1024;

type Fetcher = typeof fetch;

export async function googleStatus(fetcher: Fetcher = fetch): Promise<GoogleStatus> {
  try {
    const response = await fetcher("/api/drive/session", { cache: "no-store" });
    const body = await response.json();
    return { configured: Boolean(body.configured), connected: Boolean(body.connected), canEmail: Boolean(body.canEmail), email: body.email || null };
  } catch {
    return { configured: false, connected: false, canEmail: false, email: null };
  }
}

function base64Lines(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return (btoa(binary).match(/.{1,76}/g) || []).join("\r\n");
}

function headerSafe(value: string) {
  return String(value || "file").replace(/["\\\r\n]+/g, "_");
}

// Multipart body only; the server adds From/To/Subject.
export function buildPackageEmail(text: string, attachments: DeliveryFile[], boundary = `hpd_${crypto.randomUUID().replace(/-/g, "")}`) {
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(new TextEncoder().encode(text)),
  ];
  for (const file of attachments) {
    const name = headerSafe(file.name);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${headerSafe(file.mimeType)}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(file.bytes)
    );
  }
  parts.push(`--${boundary}--`, "");
  return { boundary, body: parts.join("\r\n") };
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return String(body.error || fallback);
  } catch {
    return fallback;
  }
}

export async function deliverPackage(
  options: {
    folderName: string;
    // Filing path under "HPD Packages", e.g. ["2026", "10 - October", "Manhattan"].
    folderPath?: string[];
    files: DeliveryFile[];
    // What the email carries, if not every file (e.g. only the signed PDF and before/after photos).
    emailFiles?: DeliveryFile[];
    emailSubject: string;
    emailText: (folderLink: string, attachedPhotos: boolean, summary: EmailAttachmentSummary) => string;
    sendEmail: boolean;
    // Saved to the same Drive folder but never attached to the email (the unsigned print copy).
    driveOnlyFiles?: DeliveryFile[];
    onProgress?: (message: string) => void;
  },
  fetcher: Fetcher = fetch
): Promise<DeliveryResult> {
  const progress = options.onProgress || (() => undefined);
  progress("Creating Google Drive folder...");
  const folderResponse = await fetcher("/api/drive/package-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: options.folderName, path: options.folderPath || [] }),
  });
  if (!folderResponse.ok) throw new Error(await readError(folderResponse, "Could not create the Google Drive folder."));
  const { folderId, link } = await folderResponse.json();

  let uploaded = 0;
  const fileLinks: Record<string, string> = {};
  const driveFiles = [...options.files, ...(options.driveOnlyFiles || [])];
  for (const file of driveFiles) {
    progress(`Saving to Google Drive: ${uploaded + 1} of ${driveFiles.length} files...`);
    const response = await fetcher("/api/drive/package-file", {
      method: "POST",
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "X-HPD-Folder": folderId,
        "X-HPD-Name": encodeURIComponent(file.name),
        ...(file.subfolder ? { "X-HPD-Subfolder": encodeURIComponent(file.subfolder) } : {}),
      },
      body: new Blob([file.bytes as BlobPart], { type: file.mimeType }),
    });
    if (!response.ok) throw new Error(await readError(response, `Could not save ${file.name} to Google Drive.`));
    try {
      const saved = await response.json();
      if (saved?.id) fileLinks[file.name] = `https://drive.google.com/file/d/${encodeURIComponent(saved.id)}/view`;
    } catch {}
    uploaded += 1;
  }

  const result: DeliveryResult = { folderLink: link, uploaded, emailed: false, emailTo: [], emailError: "", attachedPhotos: false, fileLinks };
  if (!options.sendEmail) return result;
  return { ...result, ...(await sendPackageEmail({ ...options, folderLink: link, fileLinks }, fetcher)) };
}

// Email only (also used to retry after Gmail refused, without uploading to Drive again).
export async function sendPackageEmail(
  options: {
    folderLink: string;
    files: DeliveryFile[];
    emailFiles?: DeliveryFile[];
    fileLinks?: Record<string, string>;
    emailSubject: string;
    emailText: (folderLink: string, attachedPhotos: boolean, summary: EmailAttachmentSummary) => string;
    onProgress?: (message: string) => void;
  },
  fetcher: Fetcher = fetch
): Promise<Pick<DeliveryResult, "emailed" | "emailTo" | "emailError" | "attachedPhotos" | "emailSummary" | "emailReceipt">> {
  // PDF always; then photos, then videos, as many as fit in one email. Anything that doesn't
  // fit is listed in the email with its own Drive link, so nothing is silently left out.
  const source = options.emailFiles || options.files;
  const pdfs = source.filter((file) => file.mimeType === "application/pdf");
  const photos = source.filter((file) => file.mimeType.startsWith("image/"));
  const videos = source.filter((file) => file.mimeType.startsWith("video/"));
  let total = pdfs.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  const attachments = [...pdfs];
  const summary: EmailAttachmentSummary = { photos: 0, videos: 0, linked: [] };
  for (const file of [...photos, ...videos]) {
    const isVideo = file.mimeType.startsWith("video/");
    if (total + file.bytes.byteLength <= EMAIL_ATTACHMENT_LIMIT) {
      attachments.push(file);
      total += file.bytes.byteLength;
      if (isVideo) summary.videos += 1; else summary.photos += 1;
    } else {
      summary.linked.push({ name: file.name, url: options.fileLinks?.[file.name] || "" });
    }
  }
  const attachedPhotos = photos.length > 0 && summary.photos === photos.length;
  options.onProgress?.("Sending email...");
  const email = buildPackageEmail(options.emailText(options.folderLink, attachedPhotos, summary), attachments);
  const sent = await fetcher("/api/drive/email-package", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-HPD-Boundary": email.boundary, "X-HPD-Subject": encodeURIComponent(options.emailSubject) },
    body: email.body,
  });
  if (!sent.ok) return { emailed: false, emailTo: [], emailError: await readError(sent, "The email could not be sent."), attachedPhotos, emailSummary: summary };
  const body = await sent.json();
  const emailReceipt = { messageId: String(body.messageId || ""), inInbox: Array.isArray(body.labels) && body.labels.includes("INBOX") };
  return { emailed: true, emailTo: body.to || [], emailError: "", attachedPhotos, emailSummary: summary, emailReceipt };
}

// A text-only email to the owner (e.g. the end-of-day summary), through the same route as packages,
// which only sends to the owner's configured recipients.
export async function sendTextEmail(subject: string, text: string, fetcher: Fetcher = fetch): Promise<{ emailed: boolean; emailTo: string[]; error: string }> {
  try {
    const email = buildPackageEmail(text, []);
    const sent = await fetcher("/api/drive/email-package", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-HPD-Boundary": email.boundary, "X-HPD-Subject": encodeURIComponent(subject) },
      body: email.body,
    });
    if (!sent.ok) return { emailed: false, emailTo: [], error: await readError(sent, "The email could not be sent.") };
    const body = await sent.json();
    return { emailed: true, emailTo: body.to || [], error: "" };
  } catch {
    return { emailed: false, emailTo: [], error: "No connection: the email wasn't sent." };
  }
}
