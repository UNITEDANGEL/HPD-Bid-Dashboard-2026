// Signature images, kept on this device only (localStorage) -- never uploaded or bundled with
// the site. The signer's goes on the affidavit "Signature" line and the invoice "Signature of
// Principal" line. The notary's own saved signature is only ever placed after the notary
// confirms they witnessed the signing and approves that affidavit.

export const SIGNATURE_KEY = "hpd-signer-signature-v1";
export const NOTARY_SIGNATURE_KEY = "hpd-notary-signature-v1";
const MAX_SIGNATURE_CHARS = 600_000;

export function loadSignature(key = SIGNATURE_KEY): string {
  try {
    const value = localStorage.getItem(key) || "";
    return value.startsWith("data:image/png;base64,") ? value : "";
  } catch {
    return "";
  }
}

export function saveSignature(dataUrl: string, key = SIGNATURE_KEY) {
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Signature must be a PNG image.");
  if (dataUrl.length > MAX_SIGNATURE_CHARS) throw new Error("Signature image is too large. Draw it again or use a smaller picture.");
  localStorage.setItem(key, dataUrl);
}

export function clearSignature(key = SIGNATURE_KEY) {
  try {
    localStorage.removeItem(key);
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

// Shared handwriting font for "type to sign": loaded once, reused by the signer's card and
// the notary's card. Great Vibes (OFL) ships with the app so it looks the same everywhere.
let fontLoad: Promise<boolean> | null = null;
export function loadHandwritingFont() {
  fontLoad ??= (async () => {
    try {
      const face = new FontFace("HPD Signature", "url(/fonts/great-vibes-latin.woff2)");
      document.fonts.add(await face.load());
      return true;
    } catch {
      fontLoad = null;
      return false;
    }
  })();
  return fontLoad;
}

// Typed name in a handwriting font, adopted as that person's own e-signature.
export async function signatureFromTypedName(rawName: string): Promise<string> {
  const raw = rawName.trim();
  // Signatures are written in mixed case: "JOTJAGRAJ SINGH" -> "Jotjagraj Singh".
  const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : raw;
  if (!name) throw new Error("Type a name first.");

  const handwriting = await loadHandwritingFont();
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 300;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#0b1f4d";
  context.textBaseline = "middle";
  let size = 150;
  const font = (px: number) => handwriting
    ? `${px}px "HPD Signature"`
    : `italic ${px}px "Snell Roundhand", "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
  context.font = font(size);
  while (size > 40 && context.measureText(name).width > canvas.width - 40) {
    size -= 6;
    context.font = font(size);
  }
  context.fillText(name, 30, canvas.height / 2);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) throw new Error("That name could not be drawn. Try signing with your finger.");
  return trimCanvas(canvas, minX, minY, maxX + 2, maxY + 2);
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
