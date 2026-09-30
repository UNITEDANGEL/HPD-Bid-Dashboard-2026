import { compactImageDataUrl, dataUrlToBytes, type FieldMedia } from "./field-photo-store";
import { compressEmailVideo } from "./email-video";

// Reserve space for base64/MIME encoding and message headers below a 25 MB envelope.
export const EMAIL_ZIP_MAX_BYTES = 18_000_000;

export async function fitEmailVideos(rows: FieldMedia[], reservedBytes: number, progress: (message: string) => void,
  compress = compressEmailVideo) {
  const size = (row: FieldMedia) => dataUrlToBytes(row.dataUrl).byteLength;
  const total = rows.reduce((sum, row) => sum + size(row), reservedBytes);
  if (total <= EMAIL_ZIP_MAX_BYTES) return rows;
  const videoBytes = rows.filter(row => row.mediaType === "video").reduce((sum, row) => sum + size(row), 0);
  const available = EMAIL_ZIP_MAX_BYTES - (total - videoBytes);
  if (!videoBytes || available <= 0) throw new Error("Photos and documents exceed the email budget. No evidence removed.");
  const copies: FieldMedia[] = [];
  for (const row of rows) {
    if (row.mediaType !== "video") { copies.push(row); continue; }
    const budget = Math.floor(available * size(row) / videoBytes);
    progress(`Compressing ${row.name} for email... Keep this screen open.`);
    const copy = await compress(row, budget, value => progress(`Compressing ${row.name}: ${Math.round(value * 100)}%`));
    if (size(copy) > budget || !size(copy)) throw new Error("Video copy exceeds its budget. Original retained.");
    copies.push(copy);
  }
  return copies;
}

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
