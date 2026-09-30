import { compactImageDataUrl, dataUrlToBytes, type FieldMedia } from "./field-photo-store";

// Reserve space for base64/MIME encoding and message headers below a 25 MB envelope.
export const EMAIL_ZIP_MAX_BYTES = 18_000_000;

export function assertEmailPackageSize(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > EMAIL_ZIP_MAX_BYTES) {
    throw new Error(`Email package is ${(size / 1_000_000).toFixed(1)} MB. Limit is 18 MB to allow email encoding within 25 MB. No evidence was removed. Shorter/smaller video copies are needed; saved originals are unchanged.`);
  }
}

export async function emailMediaCopies(media: FieldMedia[]) {
  const copies: FieldMedia[] = [];
  for (const row of media) {
    if (row.mediaType !== "image") { copies.push({ ...row }); continue; }
    const dataUrl = await compactImageDataUrl(row.dataUrl, 1100, 0.52);
    const size = dataUrlToBytes(dataUrl).byteLength;
    const originalSize = dataUrlToBytes(row.dataUrl).byteLength;
    copies.push(size < originalSize && dataUrl.startsWith("data:image/jpeg;")
      ? { ...row, dataUrl, size, type: "image/jpeg", name: row.name.replace(/\.[^.]+$/, "") + ".jpg" }
      : { ...row });
  }
  return copies;
}
