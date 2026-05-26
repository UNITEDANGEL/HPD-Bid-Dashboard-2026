const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
function cleanKey(value) {
  return String(value || "").trim();
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (!env.HPD_STATUS_OVERRIDES) {
      return json({ ok: false, error: "KV binding HPD_STATUS_OVERRIDES is missing." }, 500);
    }
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "HPD status override worker" });
    }
    if (url.pathname === "/overrides" && request.method === "GET") {
      const list = await env.HPD_STATUS_OVERRIDES.list();
      const overrides = {};
      for (const item of list.keys) {
        const value = await env.HPD_STATUS_OVERRIDES.get(item.name, "json");
        if (value) overrides[item.name] = value;
      }
      return json({ ok: true, overrides });
    }
    if (url.pathname === "/override" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const key = cleanKey(body?.key || body?.OMO || body?.omo || body?.id);
      const patch = body?.patch && typeof body.patch === "object" ? body.patch : body;
      if (!key) {
        return json({ ok: false, error: "Missing key/OMO." }, 400);
      }
      const saved = {
        ...patch,
        OMO: key,
        updatedAt: new Date().toISOString(),
      };
      await env.HPD_STATUS_OVERRIDES.put(key, JSON.stringify(saved));
      return json({ ok: true, key, override: saved });
    }
    if (url.pathname === "/override" && request.method === "DELETE") {
      const key = cleanKey(url.searchParams.get("key"));
      if (!key) {
        return json({ ok: false, error: "Missing key." }, 400);
      }
      await env.HPD_STATUS_OVERRIDES.delete(key);
      return json({ ok: true, deleted: key });
    }
    return json({ ok: false, error: "Not found." }, 404);
  },
};
