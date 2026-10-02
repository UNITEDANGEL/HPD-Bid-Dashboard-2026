// The signer's own signature image, kept on this device only (localStorage) and placed on the
// affidavit "Signature" line and the invoice "Signature of Principal" line.
// Never used for the notary section: the notary signs, stamps and dates in person or online.

export const SIGNATURE_KEY = "hpd-signer-signature-v1";
const MAX_SIGNATURE_CHARS = 600_000;

export function loadSignature(): string {
  try {
    const value = localStorage.getItem(SIGNATURE_KEY) || "";
    return value.startsWith("data:image/png;base64,") ? value : "";
  } catch {
    return "";
  }
}

export function saveSignature(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Signature must be a PNG image.");
  if (dataUrl.length > MAX_SIGNATURE_CHARS) throw new Error("Signature image is too large. Draw it again or use a smaller picture.");
  localStorage.setItem(SIGNATURE_KEY, dataUrl);
}

export function clearSignature() {
  try {
    localStorage.removeItem(SIGNATURE_KEY);
  } catch {}
}

export function signatureBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

// A photo of a signature on paper: keep dark ink, make the paper transparent, trim to the ink.
export async function signatureFromPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read. Try a JPG or PNG."));
      img.src = url;
    });
    const scale = Math.min(1, 1200 / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (y * canvas.width + x) * 4;
        const light = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
        if (light > 150) {
          pixels.data[i + 3] = 0;
        } else {
          pixels.data[i + 3] = Math.min(255, Math.round((150 - light) * 2.2));
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0) throw new Error("No signature ink found in that picture.");
    context.putImageData(pixels, 0, 0);
    return trimCanvas(canvas, minX, minY, maxX, maxY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function trimCanvas(canvas: HTMLCanvasElement, minX: number, minY: number, maxX: number, maxY: number) {
  const pad = 6;
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  const width = Math.min(canvas.width, maxX + pad) - x, height = Math.min(canvas.height, maxY + pad) - y;
  const out = document.createElement("canvas");
  out.width = Math.max(1, width);
  out.height = Math.max(1, height);
  out.getContext("2d")!.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return out.toDataURL("image/png");
}
