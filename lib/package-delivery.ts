// Sends an approved package to Google Drive and email through /api/drive (server/drive-packages.mjs).

export type DeliveryFile = { name: string; mimeType: string; bytes: Uint8Array };

export type GoogleStatus = { configured: boolean; connected: boolean; canEmail: boolean; email: string | null };

export type DeliveryResult = {
  folderLink: string;
  uploaded: number;
  emailed: boolean;
  emailTo: string[];
  emailError: string;
  attachedPhotos: boolean;
};

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
    files: DeliveryFile[];
    emailSubject: string;
    emailText: (folderLink: string, attachedPhotos: boolean) => string;
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
    body: JSON.stringify({ name: options.folderName }),
  });
  if (!folderResponse.ok) throw new Error(await readError(folderResponse, "Could not create the Google Drive folder."));
  const { folderId, link } = await folderResponse.json();

  let uploaded = 0;
  const driveFiles = [...options.files, ...(options.driveOnlyFiles || [])];
  for (const file of driveFiles) {
    progress(`Saving to Google Drive: ${uploaded + 1} of ${driveFiles.length} files...`);
    const response = await fetcher("/api/drive/package-file", {
      method: "POST",
      headers: { "Content-Type": file.mimeType || "application/octet-stream", "X-HPD-Folder": folderId, "X-HPD-Name": encodeURIComponent(file.name) },
      body: new Blob([file.bytes as BlobPart], { type: file.mimeType }),
    });
    if (!response.ok) throw new Error(await readError(response, `Could not save ${file.name} to Google Drive.`));
    uploaded += 1;
  }

  const result: DeliveryResult = { folderLink: link, uploaded, emailed: false, emailTo: [], emailError: "", attachedPhotos: false };
  if (!options.sendEmail) return result;
  return { ...result, ...(await sendPackageEmail({ ...options, folderLink: link }, fetcher)) };
}

// Email only (also used to retry after Gmail refused, without uploading to Drive again).
export async function sendPackageEmail(
  options: {
    folderLink: string;
    files: DeliveryFile[];
    emailSubject: string;
    emailText: (folderLink: string, attachedPhotos: boolean) => string;
    onProgress?: (message: string) => void;
  },
  fetcher: Fetcher = fetch
): Promise<Pick<DeliveryResult, "emailed" | "emailTo" | "emailError" | "attachedPhotos">> {
  // PDF always; photos too when they fit in one email. Videos stay in Drive.
  const pdfs = options.files.filter((file) => file.mimeType === "application/pdf");
  const photos = options.files.filter((file) => file.mimeType.startsWith("image/"));
  const photoBytes = [...pdfs, ...photos].reduce((sum, file) => sum + file.bytes.byteLength, 0);
  const attachedPhotos = photos.length > 0 && photoBytes <= EMAIL_ATTACHMENT_LIMIT;
  const attachments = attachedPhotos ? [...pdfs, ...photos] : pdfs;
  options.onProgress?.("Sending email...");
  const email = buildPackageEmail(options.emailText(options.folderLink, attachedPhotos), attachments);
  const sent = await fetcher("/api/drive/email-package", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-HPD-Boundary": email.boundary, "X-HPD-Subject": encodeURIComponent(options.emailSubject) },
    body: email.body,
  });
  if (!sent.ok) return { emailed: false, emailTo: [], emailError: await readError(sent, "The email could not be sent."), attachedPhotos };
  const body = await sent.json();
  return { emailed: true, emailTo: body.to || [], emailError: "", attachedPhotos };
}
