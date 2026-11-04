// 📸 Photo check (owner idea, 3 Nov): before the paperwork goes to HPD, look at each before/after photo on this phone
// and say if one is blurry, too dark, washed out, or missing. All on the phone (no AI service, no upload, free).
// The evidence stamp bands (top and bottom) are left out, so their sharp white text doesn't hide a blurry photo.

export type PhotoVerdict = "ok" | "blurry" | "dark" | "bright";
export type PhotoJudgement = { verdict: PhotoVerdict; light: number; sharpness: number };

const SIDE = 240;
const DARK = 40, BRIGHT = 238, BLURRY = 25;

// gray: one 0-255 value per pixel, row by row.
export function judgePixels(gray: ArrayLike<number>, width: number, height: number): PhotoJudgement {
  let sum = 0;
  for (let i = 0; i < width * height; i++) sum += gray[i];
  const light = width * height ? sum / (width * height) : 0;
  // Sharpness: how much the edges jump (variance of the Laplacian).
  let n = 0, mean = 0, sq = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      n++; mean += lap; sq += lap * lap;
    }
  }
  const sharpness = n ? sq / n - (mean / n) ** 2 : 0;
  const verdict: PhotoVerdict = light < DARK ? "dark" : light > BRIGHT && sharpness < BLURRY * 4 ? "bright" : sharpness < BLURRY ? "blurry" : "ok";
  return { verdict, light: Math.round(light), sharpness: Math.round(sharpness) };
}

export async function checkPhoto(dataUrl: string): Promise<PhotoJudgement | null> {
  if (!dataUrl || typeof document === "undefined") return null;
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("bad image")); img.src = dataUrl; });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return null;
    // The middle of the photo, between the stamp bands.
    const top = Math.round(h0 * 0.16), bottom = Math.round(h0 * 0.8);
    const scale = SIDE / Math.max(w0, bottom - top);
    const w = Math.max(8, Math.round(w0 * scale)), h = Math.max(8, Math.round((bottom - top) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, top, w0, bottom - top, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    return judgePixels(gray, w, h);
  } catch {
    return null;
  }
}

export type PhotoCheckItem = { id: string; kind: "before" | "after"; verdict: PhotoVerdict; dataUrl: string };
export type PhotoCheckSummary = { problems: string[]; bad: PhotoCheckItem[]; checked: number; good: boolean };

const SAY: Record<Exclude<PhotoVerdict, "ok">, string> = { blurry: "looks blurry", dark: "is too dark", bright: "is washed out (too bright)" };

// counts: all before/after photos and videos; items: the photos that were looked at. work: the job was worked on, so
// HPD needs both before and after.
export function summarizePhotoCheck(items: PhotoCheckItem[], counts: { before: number; after: number }, work: boolean): PhotoCheckSummary {
  const problems: string[] = [];
  if (work || counts.before || counts.after) {
    if (!counts.before) problems.push("No before photo yet. HPD needs one.");
    if (!counts.after) problems.push("No after photo yet. HPD needs one.");
  }
  const bad = items.filter((item) => item.verdict !== "ok");
  for (const kind of ["before", "after"] as const) {
    for (const verdict of ["blurry", "dark", "bright"] as const) {
      const n = bad.filter((item) => item.kind === kind && item.verdict === verdict).length;
      if (n) problems.push(`${n === 1 ? `1 ${kind} photo` : `${n} ${kind} photos`} ${n === 1 ? SAY[verdict] : SAY[verdict].replace(/^is /, "are ").replace(/^looks /, "look ")}: take ${n === 1 ? "it" : "them"} again.`);
    }
  }
  return { problems, bad, checked: items.length, good: !problems.length && items.length > 0 };
}

// 📸 What the helper says about the photo you just took (owner's pick, 4 Nov).
export function photoComment(verdict: PhotoVerdict, kind: "before" | "after") {
  const what = kind === "before" ? "before photo" : "after photo";
  return verdict === "ok" ? `Nice ${what}, that one looks good.`
    : verdict === "blurry" ? `That ${what} looks a bit blurry. Hold the phone still and take another.`
    : verdict === "dark" ? `That ${what} is a bit dark. Turn on a light or the flash and take another.`
    : `That ${what} is too bright. Step out of the glare and take another.`;
}
