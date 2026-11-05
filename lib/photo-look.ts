// "What do you see?" on the job card (owner idea, 4 Nov): asks the app's free picture AI to name the problem in one
// before photo. The owner sees the answer first and decides whether it goes in the job notes.

export type PhotoLook = { ok: true; text: string } | { ok: false; reason: "off" | "cap" | "error" | "bad" | "offline" };

// The AI's sentence as a short note ("Leak stain on the ceiling"), or "" when it saw nothing wrong.
export function lookNote(raw: string): string {
  const t = String(raw || "").replace(/\s+/g, " ").trim().replace(/^(the (photo|image|picture) (shows|depicts)|this is|i see|there is|there are)\s+/i, "").replace(/^(a|an|the)\s+/i, "");
  if (!t || /no (visible )?problem|nothing wrong|looks (fine|good)|no (damage|issue)/i.test(t)) return "";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return `Photo shows: ${s.replace(/[.\s]+$/, "")}`.slice(0, 160);
}

export function lookMessage(reason: string): string {
  return reason === "off" ? "The picture AI isn't switched on for the app yet."
    : reason === "cap" ? "The free picture AI is used up for today (30 a day). Try tomorrow."
    : reason === "offline" ? "No signal. Try again when you're online."
    : "I couldn't read that photo. Try again.";
}

async function smallJpeg(dataUrl: string): Promise<string | null> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("bad")); img.src = dataUrl; });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return null;
    const scale = Math.min(1, 512 / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  } catch { return null; }
}

export async function lookAtPhoto(dataUrl: string): Promise<PhotoLook> {
  const image = await smallJpeg(dataUrl);
  if (!image) return { ok: false, reason: "bad" };
  try {
    const r = await fetch("/api/photo-look", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
    const j = await r.json();
    return j?.ok ? { ok: true, text: String(j.text || "") } : { ok: false, reason: ["off", "cap", "bad"].includes(j?.reason) ? j.reason : "error" };
  } catch { return { ok: false, reason: "offline" }; }
}
