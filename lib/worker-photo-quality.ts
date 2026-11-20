// 📷 Is this photo good enough? (owner, 20 Nov: "if your image is not good it asks to retake the image"). Runs on the phone,
// nothing is sent anywhere: the picture is shrunk to 160 px, then too dark / too bright / blurry is judged from the pixels.
export type PhotoVerdict = { ok: boolean; reason?: string };

export function judgePixels(gray: Uint8ClampedArray | number[], w: number, h: number): PhotoVerdict {
  const n = w * h;
  if (!n || gray.length < n) return { ok: true };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const mean = sum / n;
  if (mean < 35) return { ok: false, reason: "Too dark: turn the lights on or use the flash, then retake." };
  if (mean > 235) return { ok: false, reason: "Too bright: move away from the light, then retake." };
  // Sharpness: variance of the Laplacian (a blurry picture has almost no edges).
  let s = 0, s2 = 0, c = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    s += l; s2 += l * l; c++;
  }
  const variance = c ? s2 / c - (s / c) ** 2 : 0;
  if (variance < 12) return { ok: false, reason: "Blurry: hold the phone still, then retake." };
  return { ok: true };
}

export async function judgePhoto(file: File): Promise<PhotoVerdict> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
    const w = Math.max(8, Math.round(bmp.width * scale)), h = Math.max(8, Math.round(bmp.height * scale));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return { ok: true };
    ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return judgePixels(gray, w, h);
  } catch { return { ok: true }; } // can't read it here: don't block the worker
}
