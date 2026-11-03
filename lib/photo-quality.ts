// Photo check before you send (3 Nov): looks at a picture on the phone and says if it is too dark or blurry.
// Nothing leaves the phone. The pixel math is separate so it can be tested without a browser.
export type PhotoFacts = { brightness: number; sharpness: number };
export const DARK_BELOW = 45;
export const BLURRY_BELOW = 6;

// rgba = canvas pixels (width x height). brightness 0-255 average; sharpness = average difference between
// neighbouring pixels (a blurry picture has almost none).
export function photoFacts(rgba: ArrayLike<number>, width: number, height: number): PhotoFacts {
  const gray = new Float32Array(width * height);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    const g = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    gray[i] = g;
    total += g;
  }
  let diff = 0, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = gray[y * width + x];
      if (x + 1 < width) { diff += Math.abs(here - gray[y * width + x + 1]); count++; }
      if (y + 1 < height) { diff += Math.abs(here - gray[(y + 1) * width + x]); count++; }
    }
  }
  return { brightness: gray.length ? total / gray.length : 0, sharpness: count ? diff / count : 0 };
}

export function photoProblem(facts: PhotoFacts): "dark" | "blurry" | "" {
  if (facts.brightness < DARK_BELOW) return "dark";
  if (facts.sharpness < BLURRY_BELOW) return "blurry";
  return "";
}

// Browser only: shrink the picture to 160 px wide and check it. "" = looks fine (or couldn't check).
export async function checkImageFile(file: File): Promise<"dark" | "blurry" | ""> {
  try {
    if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return "";
    const bitmap = await createImageBitmap(file);
    const width = 160, height = Math.max(1, Math.round((bitmap.height / bitmap.width) * 160));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return photoProblem(photoFacts(ctx.getImageData(0, 0, width, height).data, width, height));
  } catch {
    return "";
  }
}
