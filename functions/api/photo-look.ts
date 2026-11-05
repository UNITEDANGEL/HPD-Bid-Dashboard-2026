// "What do you see?" (owner idea, 4 Nov; owner said yes to the free picture AI): one small before photo goes to the free
// Cloudflare picture AI (Workers AI), which names the problem in a few words. Hard cap of 30 photos a day for the whole
// app. No cap store or no AI = it says so and does nothing (fails closed, never a paid service). Nothing is saved here.
type Env = {
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  HPD_DRIVE_SESSIONS?: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> };
};

const DAILY_CAP = 30;
const MAX_DATA_URL = 450_000;
const MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.AI || !env.HPD_DRIVE_SESSIONS) return json({ ok: false, reason: "off" });
  let body: { image?: string };
  try { body = (await request.json()) as { image?: string }; } catch { return json({ ok: false, reason: "bad" }, 400); }
  const image = String(body.image || "");
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m || image.length > MAX_DATA_URL) return json({ ok: false, reason: "bad" }, 400);

  const day = new Date().toISOString().slice(0, 10);
  const key = `photo-look-${day}`;
  const used = Number(await env.HPD_DRIVE_SESSIONS.get(key)) || 0;
  if (used >= DAILY_CAP) return json({ ok: false, reason: "cap", used, cap: DAILY_CAP });
  await env.HPD_DRIVE_SESSIONS.put(key, String(used + 1), { expirationTtl: 172800 });

  try {
    const bin = atob(m[1]);
    const bytes = Array.from({ length: bin.length }, (_, i) => bin.charCodeAt(i));
    const out: any = await env.AI.run(MODEL, {
      image: bytes,
      prompt: "This is a photo from a New York apartment repair inspection. In one short sentence, name the visible problem (for example leak stain, mold, peeling paint, broken plaster, cracked wall, hole). If you see no problem, say: no problem seen.",
      max_tokens: 60,
    });
    const text = String(out?.description || out?.response || "").replace(/\s+/g, " ").trim().slice(0, 200);
    return json({ ok: true, text, used: used + 1, cap: DAILY_CAP });
  } catch {
    return json({ ok: false, reason: "error" });
  }
};
